// unj-reze リアルタイムハブ
//
// 目的: Neon(Postgres)から「常時動き続ける処理」を剥がす。
//   - ゴーストプレイヤーの位置同期 … 完全にインメモリ。DBには一切書かない。
//   - 新着投稿 / 返信 / 通知の配信 … Next 側の書き込みAPIから /publish を叩き、
//     購読中のクライアントへ push する。クライアントのポーリングを無くすのが狙い。
//
// 状態はプロセス内メモリのみ。永続化しないので再起動で消えて構わないデータだけを扱う。
// ＊単一インスタンス前提＊ 複数インスタンスへ水平分割すると presence と配信が
// インスタンス間で分断される。増やすときは Redis 等の共有バスが必要（README 参照）。

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8000);
const PUBLISH_SECRET = process.env.REALTIME_PUBLISH_SECRET || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** presence エントリの寿命。これを過ぎたら退出扱い。 */
const PRESENCE_TTL_MS = 10_000;
/** presence をまとめて配信する間隔。 */
const PRESENCE_TICK_MS = 1_000;
/** 死んだ接続を切るための ping 間隔。 */
const HEARTBEAT_MS = 30_000;

const MAX_CHANNELS_PER_CONN = 32;
const MAX_MESSAGE_BYTES = 16 * 1024;
/** 1接続あたりの受信レート上限（RATE_WINDOW_MS ごと）。 */
const RATE_LIMIT_MSGS = 120;
const RATE_WINDOW_MS = 10_000;
/** 1ルームに保持する presence の上限（メモリ暴走の防止）。 */
const MAX_PLAYERS_PER_ROOM = 200;

/** channel -> Set<ws> */
const channels = new Map();
/** gameId -> Map<sessionId, {x, y, emoji, ts}> */
const presence = new Map();
/** 直近の tick 以降に変化のあったゲームID */
const dirtyRooms = new Set();

const stats = { connections: 0, published: 0, delivered: 0, startedAt: Date.now() };

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function secretMatches(provided) {
  if (!PUBLISH_SECRET) return false;
  const a = Buffer.from(provided || '');
  const b = Buffer.from(PUBLISH_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function originAllowed(origin) {
  // 未設定なら制限しない（ローカル開発・自前運用向け）
  if (ALLOWED_ORIGINS.length === 0) return true;
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

// ── チャンネル購読 ───────────────────────────────────────────────

function subscribe(ws, channel) {
  if (typeof channel !== 'string' || channel.length === 0 || channel.length > 128) return;
  if (ws.channels.size >= MAX_CHANNELS_PER_CONN) return;
  ws.channels.add(channel);
  let set = channels.get(channel);
  if (!set) {
    set = new Set();
    channels.set(channel, set);
  }
  set.add(ws);
}

function unsubscribe(ws, channel) {
  ws.channels.delete(channel);
  const set = channels.get(channel);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) channels.delete(channel);
}

function unsubscribeAll(ws) {
  for (const channel of ws.channels) {
    const set = channels.get(channel);
    if (!set) continue;
    set.delete(ws);
    if (set.size === 0) channels.delete(channel);
  }
  ws.channels.clear();
}

/** 同じ文字列を購読者へ配る。ペイロードは1回だけ直列化する。 */
function broadcast(channel, payloadString) {
  const set = channels.get(channel);
  if (!set || set.size === 0) return 0;
  let sent = 0;
  for (const ws of set) {
    if (ws.readyState !== ws.OPEN) continue;
    try {
      ws.send(payloadString);
      sent++;
    } catch {
      // 送信失敗した接続は close ハンドラ側で片付く
    }
  }
  stats.delivered += sent;
  return sent;
}

// ── presence（ゴーストプレイヤー） ───────────────────────────────

function roomOf(gameId) {
  let room = presence.get(gameId);
  if (!room) {
    room = new Map();
    presence.set(gameId, room);
  }
  return room;
}

function updatePresence(gameId, sessionId, x, y, emoji, rotY, anim) {
  const room = roomOf(gameId);
  if (!room.has(sessionId) && room.size >= MAX_PLAYERS_PER_ROOM) return;
  room.set(sessionId, { x, y, emoji, rotY, anim, ts: Date.now() });
  dirtyRooms.add(gameId);
}

function dropPresence(gameId, sessionId) {
  const room = presence.get(gameId);
  if (!room) return;
  if (room.delete(sessionId)) dirtyRooms.add(gameId);
}

/** TTL 切れを掃除して、変化のあった部屋だけ配信する。 */
function presenceTick() {
  const now = Date.now();
  for (const [gameId, room] of presence) {
    for (const [sessionId, entry] of room) {
      if (now - entry.ts > PRESENCE_TTL_MS) {
        room.delete(sessionId);
        dirtyRooms.add(gameId);
      }
    }
    if (room.size === 0) {
      presence.delete(gameId);
      dirtyRooms.add(gameId);
    }
  }

  for (const gameId of dirtyRooms) {
    const room = presence.get(gameId);
    const players = room
      ? [...room].map(([sessionId, e]) => ({
          sessionId,
          x: e.x,
          y: e.y,
          emoji: e.emoji,
          // mmo3d専用（任意）。無ければ受信側で単に undefined のまま無視される。
          ...(e.rotY !== undefined ? { rotY: e.rotY } : {}),
          ...(e.anim !== undefined ? { anim: e.anim } : {}),
        }))
      : [];
    // 自分を含めた全員を配る。除外はクライアント側で行う
    // （1部屋につき直列化1回で済ませるため）。
    broadcast(`game:${gameId}`, JSON.stringify({ t: 'presence', game: gameId, players }));
  }
  dirtyRooms.clear();
}

// ── HTTP（/publish, /healthz） ──────────────────────────────────

function readBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

/** {channel, event, data} を1件配信する。 */
function publishOne(item) {
  if (!item || typeof item.channel !== 'string' || typeof item.event !== 'string') return 0;
  const payload = JSON.stringify({
    t: 'event',
    channel: item.channel,
    event: item.event,
    data: item.data ?? null,
  });
  stats.published++;
  return broadcast(item.channel, payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && (url.pathname === '/healthz' || url.pathname === '/')) {
    let presenceCount = 0;
    for (const room of presence.values()) presenceCount += room.size;
    sendJson(res, 200, {
      ok: true,
      uptimeSec: Math.floor((Date.now() - stats.startedAt) / 1000),
      connections: stats.connections,
      channels: channels.size,
      rooms: presence.size,
      players: presenceCount,
      published: stats.published,
      delivered: stats.delivered,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/publish') {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!secretMatches(token)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'invalid json' });
      return;
    }
    const items = Array.isArray(body?.events) ? body.events : [body];
    if (items.length > 100) {
      sendJson(res, 400, { error: 'too many events' });
      return;
    }
    let delivered = 0;
    for (const item of items) delivered += publishOne(item);
    sendJson(res, 200, { ok: true, delivered });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

// ── WebSocket ──────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) {
    ws.close(1008, 'origin not allowed');
    return;
  }

  ws.channels = new Set();
  ws.games = new Map(); // gameId -> sessionId（切断時に presence を消すため）
  ws.isAlive = true;
  ws.rateCount = 0;
  ws.rateWindowStart = Date.now();
  stats.connections++;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.send(JSON.stringify({ t: 'welcome', presenceTtlMs: PRESENCE_TTL_MS }));

  ws.on('message', (raw) => {
    // レート制限（1接続あたり）
    const now = Date.now();
    if (now - ws.rateWindowStart > RATE_WINDOW_MS) {
      ws.rateWindowStart = now;
      ws.rateCount = 0;
    }
    if (++ws.rateCount > RATE_LIMIT_MSGS) return;

    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    switch (msg.t) {
      case 'sub': {
        const list = Array.isArray(msg.channels) ? msg.channels.slice(0, MAX_CHANNELS_PER_CONN) : [];
        for (const c of list) subscribe(ws, c);
        break;
      }
      case 'unsub': {
        const list = Array.isArray(msg.channels) ? msg.channels : [];
        for (const c of list) unsubscribe(ws, c);
        break;
      }
      case 'pos': {
        const gameId = typeof msg.game === 'string' ? msg.game : null;
        const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId : null;
        if (!gameId || !sessionId) break;
        if (gameId.length > 64 || sessionId.length > 128) break;
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        const emoji = typeof msg.emoji === 'string' ? msg.emoji.slice(0, 8) : '🎮';
        const rotY = Number.isFinite(Number(msg.rotY)) ? Number(msg.rotY) : undefined;
        const anim =
          typeof msg.anim === 'string' && ['idle', 'walk', 'run'].includes(msg.anim)
            ? msg.anim
            : undefined;
        ws.games.set(gameId, sessionId);
        updatePresence(gameId, sessionId, x, y, emoji, rotY, anim);
        break;
      }
      case 'leave': {
        const gameId = typeof msg.game === 'string' ? msg.game : null;
        if (!gameId) break;
        const sessionId = ws.games.get(gameId);
        if (sessionId) {
          dropPresence(gameId, sessionId);
          ws.games.delete(gameId);
        }
        break;
      }
      case 'ping':
        ws.send(JSON.stringify({ t: 'pong' }));
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    stats.connections--;
    unsubscribeAll(ws);
    for (const [gameId, sessionId] of ws.games) dropPresence(gameId, sessionId);
    ws.games.clear();
  });

  ws.on('error', () => {
    // close で片付くので握りつぶす
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* noop */
    }
  }
}, HEARTBEAT_MS);

const ticker = setInterval(presenceTick, PRESENCE_TICK_MS);

function shutdown(signal) {
  log(`received ${signal}, shutting down`);
  clearInterval(heartbeat);
  clearInterval(ticker);
  for (const ws of wss.clients) ws.close(1001, 'server shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => {
  if (!PUBLISH_SECRET) {
    log('WARN: REALTIME_PUBLISH_SECRET is not set — /publish will reject every request.');
  }
  log(`realtime hub listening on :${PORT} (ws path /ws)`);
});
