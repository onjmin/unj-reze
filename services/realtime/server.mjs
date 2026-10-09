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
//
// ── 本人性について ──
// このアプリはログインが無く、セッションID（Cookie `unj_reze_session`）が唯一の秘密情報。
// 以前はクライアントがそのセッションIDを `sessionId` として送り、presence/チャット/パーティーで
// **ルーム購読者全員へ配っていた**（＝誰でも購読するだけで他人のセッションを収集でき、
// アカウントを丸ごと乗っ取れた）。今は:
//   - 接続ごとにハブが乱数の公開ID（playerId）を振り、welcome で本人にだけ教える。
//   - クライアントが送ってくる sessionId / playerId は**一切読まない**。誰として振る舞うかは
//     WebSocket 接続そのもので決まる（＝自分以外にはなれない）。
//   - `user:<id>` チャンネル（DM本文・通知）は、Next 側 /api/realtime/token が発行した
//     署名トークンが無いと購読できない。

import http from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8000);
const PUBLISH_SECRET = process.env.REALTIME_PUBLISH_SECRET || '';
/** /healthz で統計を見るための管理用シークレット（X-Admin-Secret ヘッダ）。未設定なら統計は出さない。 */
const ADMIN_SECRET = process.env.REALTIME_ADMIN_SECRET || '';
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
/** 全体の同時接続数の上限。 */
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS || 5000);
/** 1IPあたりの同時接続数の上限。0 で無効。 */
const MAX_CONN_PER_IP = Number(process.env.MAX_CONN_PER_IP || 20);
/** チャンネル表（channel -> 購読者）の総数の上限。存在しないチャンネルを大量に作らせない。 */
const MAX_TOTAL_CHANNELS = Number(process.env.MAX_TOTAL_CHANNELS || 20_000);
/** ルーム（presence / パーティー）の総数の上限。 */
const MAX_ROOMS = 2_000;
/** パーティー招待の有効期限。 */
const INVITE_TTL_MS = 60_000;
/** 1接続が抱えておける未承諾の招待の数。 */
const MAX_PENDING_INVITES = 16;

/**
 * クライアントIPの取り方。
 *   - `xff`（既定）: X-Forwarded-For を右から TRUSTED_PROXY_HOPS 個目。左側はクライアントが
 *     自由に書けるので信用しない（右端ほど手前のプロキシが付けた値）。
 *   - `socket`: ソケットの接続元。プロキシの後ろでは全員が同じIPになるので使わないこと。
 * プライベートアドレスしか取れなかったときは「不明」とし、IP 単位の上限は掛けない
 * （プロキシ構成の読み違いで全員が1IPに見え、20接続で全停止するのを避ける fail-open）。
 */
const CLIENT_IP_SOURCE = process.env.CLIENT_IP_SOURCE || 'xff';
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS || 1));

/**
 * 購読できるチャンネル名。lib/realtime/channels.ts の関数が組み立てる形だけを通す。
 * ID は数値か sqids（英数字）なので、それ以外の文字や長すぎる名前は弾く。
 */
const CHANNEL_RE = /^(?:feed|(?:thread|game|user):[A-Za-z0-9_-]{1,64})$/;
const GAME_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** user:<id> 購読トークンの有効期限の上限（発行側は約1時間）。これより先の期限は偽物扱い。 */
const USER_TOKEN_MAX_TTL_SEC = 2 * 60 * 60;

/** channel -> Set<ws> */
const channels = new Map();
/** gameId -> Map<playerId, {x, y, emoji, ts, ws, name}> */
const presence = new Map();
/** 直近の tick 以降に変化のあったゲームID */
const dirtyRooms = new Set();
/** ip -> 同時接続数 */
const connsPerIp = new Map();

// ── パーティー（フェーズ25: mmo3dのソーシャル機能。完全にインメモリ、DBには一切書かない。
// TODO(persist): 現状パーティーは切断・再起動で消える。永続化するならgames.manifestか
// 専用テーブルの設計が必要（このハブは単一インスタンス前提のため、複数台に増やす場合は
// README記載の通りRedis等の共有バスが要る）。 ──
/** gameId -> Map<playerId, Set<playerId>>（同じSetオブジェクトを共有するのが「同じパーティー」） */
const partyOf = new Map();
const MAX_PARTY_SIZE = 4;

const stats = {
  connections: 0,
  published: 0,
  delivered: 0,
  rejectedConnections: 0,
  rejectedUserSubs: 0,
  startedAt: Date.now(),
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function safeEqual(provided, expected) {
  if (!expected) return false;
  const a = Buffer.from(provided || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function secretMatches(provided) {
  return safeEqual(provided, PUBLISH_SECRET);
}

function originAllowed(origin) {
  // 未設定なら制限しない（ローカル開発・自前運用向け）
  if (ALLOWED_ORIGINS.length === 0) return true;
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

// ── user:<id> 購読トークン ────────────────────────────────────────
// 形式: `<userId>.<expiryUnixSec>.<base64url(HMAC-SHA256(secret, "user:"+userId+"."+expiry))>`
// 発行は Next 側 app/api/realtime/token/route.ts（Web Crypto）。鍵は /publish と同じ
// REALTIME_PUBLISH_SECRET を使う（どちらもサーバー同士でしか知らない値）。

function verifyUserToken(token, userId) {
  if (!PUBLISH_SECRET || typeof token !== 'string' || token.length > 256) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tokUser, expStr, sig] = parts;
  if (tokUser !== userId) return false;
  if (!/^\d{1,12}$/.test(expStr)) return false;
  const exp = Number(expStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (exp < nowSec || exp > nowSec + USER_TOKEN_MAX_TTL_SEC) return false;
  const expected = createHmac('sha256', PUBLISH_SECRET)
    .update(`user:${tokUser}.${expStr}`)
    .digest('base64url');
  return safeEqual(sig, expected);
}

// ── クライアントIP / 接続数 ──────────────────────────────────────

function isPrivateIp(ip) {
  if (!ip) return true;
  const v = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (/^(10\.|127\.|192\.168\.|169\.254\.)/.test(v)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(v)) return true; // CGNAT（内部網でよく使われる）
  const lower = v.toLowerCase();
  if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
    return true;
  }
  return false;
}

/** IP単位の上限を掛けるためのキー。取れなければ null（上限を掛けない）。 */
function clientIpOf(req) {
  let ip = null;
  if (CLIENT_IP_SOURCE === 'socket') {
    ip = req.socket.remoteAddress || null;
  } else {
    const xff = req.headers['x-forwarded-for'];
    const list = (Array.isArray(xff) ? xff.join(',') : xff || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    ip = list.length >= TRUSTED_PROXY_HOPS ? list[list.length - TRUSTED_PROXY_HOPS] : null;
    if (!ip) ip = req.socket.remoteAddress || null;
  }
  if (!ip || isPrivateIp(ip)) return null;
  return ip;
}

// ── チャンネル購読 ───────────────────────────────────────────────

function subscribe(ws, channel) {
  if (typeof channel !== 'string' || !CHANNEL_RE.test(channel)) return;
  if (ws.channels.has(channel)) return;
  if (ws.channels.size >= MAX_CHANNELS_PER_CONN) return;
  let set = channels.get(channel);
  if (!set) {
    if (channels.size >= MAX_TOTAL_CHANNELS) return;
    set = new Set();
    channels.set(channel, set);
  }
  ws.channels.add(channel);
  set.add(ws);
}

function unsubscribe(ws, channel) {
  if (typeof channel !== 'string') return;
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

function sendTo(ws, payload) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  } catch {
    /* close ハンドラ側で片付く */
  }
}

// ── presence（ゴーストプレイヤー） ───────────────────────────────

function roomOf(gameId) {
  let room = presence.get(gameId);
  if (!room) {
    if (presence.size >= MAX_ROOMS) return null;
    room = new Map();
    presence.set(gameId, room);
  }
  return room;
}

function updatePresence(gameId, playerId, x, y, emoji, rotY, anim, ws, name, level) {
  const room = roomOf(gameId);
  if (!room) return false;
  if (!room.has(playerId) && room.size >= MAX_PLAYERS_PER_ROOM) return false;
  const prev = room.get(playerId);
  room.set(playerId, {
    x,
    y,
    emoji,
    rotY,
    anim,
    level: level ?? prev?.level,
    ts: Date.now(),
    ws,
    name: name ?? prev?.name,
  });
  dirtyRooms.add(gameId);
  return true;
}

function dropPresence(gameId, playerId) {
  const room = presence.get(gameId);
  if (room?.delete(playerId)) dirtyRooms.add(gameId);
  leaveParty(gameId, playerId);
}

// ── パーティー ─────────────────────────────────────────────────

function partyRoomOf(gameId) {
  let m = partyOf.get(gameId);
  if (!m) {
    m = new Map();
    partyOf.set(gameId, m);
  }
  return m;
}

/** パーティーの全メンバーへ直接送信する（チャンネル経由ではなく、各メンバーのws宛）。 */
function sendToParty(gameId, party, payloadString) {
  const room = presence.get(gameId);
  if (!room) return;
  for (const pid of party) sendTo(room.get(pid)?.ws, payloadString);
}

function broadcastPartyUpdate(gameId, party) {
  const room = presence.get(gameId);
  const members = [...party].map((pid) => ({
    playerId: pid,
    name: room?.get(pid)?.name,
  }));
  sendToParty(gameId, party, JSON.stringify({ t: 'partyUpdate', game: gameId, members }));
}

/** targetIdの現在のパーティーにplayerIdを合流させる（上限MAX_PARTY_SIZE）。 */
function joinParty(gameId, playerId, targetId) {
  const map = partyRoomOf(gameId);
  const mine = map.get(playerId) ?? new Set([playerId]);
  const theirs = map.get(targetId) ?? new Set([targetId]);
  if (mine === theirs) return theirs; // 既に同じパーティー
  const merged = new Set([...mine, ...theirs]);
  if (merged.size > MAX_PARTY_SIZE) return null; // 定員オーバー
  for (const pid of merged) map.set(pid, merged);
  return merged;
}

function leaveParty(gameId, playerId) {
  const map = partyOf.get(gameId);
  const party = map?.get(playerId);
  if (!party) return;
  party.delete(playerId);
  map.delete(playerId);
  if (party.size <= 1) {
    // 1人だけ残ったパーティーは解散扱い（自分自身のSetも消す）
    for (const pid of party) map.delete(pid);
    if (party.size === 1) broadcastPartyUpdate(gameId, party);
  } else {
    broadcastPartyUpdate(gameId, party);
  }
  if (map.size === 0) partyOf.delete(gameId);
}

/** TTL 切れを掃除して、変化のあった部屋だけ配信する。 */
function presenceTick() {
  const now = Date.now();
  for (const [gameId, room] of presence) {
    for (const [playerId, entry] of room) {
      if (now - entry.ts > PRESENCE_TTL_MS) {
        room.delete(playerId);
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
    // 配るのはハブが振った公開ID（playerId）だけ。セッションIDはそもそもハブに届かない。
    const players = room
      ? [...room].map(([playerId, e]) => ({
          playerId,
          x: e.x,
          y: e.y,
          emoji: e.emoji,
          // mmo3d専用（任意）。無ければ受信側で単に undefined のまま無視される。
          ...(e.rotY !== undefined ? { rotY: e.rotY } : {}),
          ...(e.anim !== undefined ? { anim: e.anim } : {}),
          ...(e.level !== undefined ? { level: e.level } : {}),
          ...(e.name !== undefined ? { name: e.name } : {}),
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
    // 既定は死活だけ。内部統計（接続数・部屋数など）は管理用シークレットがあるときだけ返す
    // （攻撃の効き具合を外から測らせない）。
    const adminHeader = req.headers['x-admin-secret'];
    if (!safeEqual(typeof adminHeader === 'string' ? adminHeader : '', ADMIN_SECRET)) {
      sendJson(res, 200, { ok: true });
      return;
    }
    let presenceCount = 0;
    for (const room of presence.values()) presenceCount += room.size;
    let maxConnPerIp = 0;
    for (const n of connsPerIp.values()) maxConnPerIp = Math.max(maxConnPerIp, n);
    sendJson(res, 200, {
      ok: true,
      uptimeSec: Math.floor((Date.now() - stats.startedAt) / 1000),
      connections: stats.connections,
      // IP が正しく取れているかの確認用（全員が同じIPに見えていたら ips が 1 になる）
      ips: connsPerIp.size,
      maxConnPerIp,
      channels: channels.size,
      rooms: presence.size,
      players: presenceCount,
      published: stats.published,
      delivered: stats.delivered,
      rejectedConnections: stats.rejectedConnections,
      rejectedUserSubs: stats.rejectedUserSubs,
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

/** 1分に1回だけ出す接続拒否ログ（IP の取り方を読み違えていないか、デプロイ後に確かめる用）。 */
let lastRejectLogAt = 0;
function logReject(reason, req, ip) {
  stats.rejectedConnections++;
  const now = Date.now();
  if (now - lastRejectLogAt < 60_000) return;
  lastRejectLogAt = now;
  log(`reject connection (${reason}) ip=${ip ?? '-'} xff=${req.headers['x-forwarded-for'] ?? '-'}`);
}

/** pos などで受け取るゲームID。ルームのキーとチャンネル名にそのまま使うので形を絞る。 */
function gameIdOf(msg) {
  return typeof msg.game === 'string' && GAME_ID_RE.test(msg.game) ? msg.game : null;
}

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) {
    ws.close(1008, 'origin not allowed');
    return;
  }

  const ip = clientIpOf(req);
  if (stats.connections >= MAX_CONNECTIONS) {
    logReject('global cap', req, ip);
    ws.close(1013, 'server busy');
    return;
  }
  if (ip && MAX_CONN_PER_IP > 0 && (connsPerIp.get(ip) ?? 0) >= MAX_CONN_PER_IP) {
    logReject('per-ip cap', req, ip);
    ws.close(1008, 'too many connections');
    return;
  }
  ws.ip = ip;
  if (ip) connsPerIp.set(ip, (connsPerIp.get(ip) ?? 0) + 1);

  // この接続の公開ID。presence/チャット/パーティーで他人に見せるのはこれだけ。
  // クライアントが名乗るIDは一切読まないので、他人のふりはできない。
  ws.playerId = randomUUID();
  ws.channels = new Set();
  ws.games = new Set(); // presence に載っている gameId（切断時に消すため）
  /** 自分宛の未承諾の招待。`${gameId}\n${fromPlayerId}` -> 期限(ms) */
  ws.invites = new Map();
  ws.isAlive = true;
  ws.rateCount = 0;
  ws.rateWindowStart = Date.now();
  stats.connections++;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  sendTo(ws, { t: 'welcome', presenceTtlMs: PRESENCE_TTL_MS, playerId: ws.playerId });

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

    const me = ws.playerId;

    switch (msg.t) {
      case 'sub': {
        const list = Array.isArray(msg.channels) ? msg.channels.slice(0, MAX_CHANNELS_PER_CONN) : [];
        for (const c of list) {
          if (typeof c !== 'string') continue;
          // 個人宛（DM本文・通知）は、その本人向けに発行された署名トークンが要る。
          // 失敗しても何も返さない（存在確認の手掛かりを与えない）。
          if (c.startsWith('user:')) {
            if (!verifyUserToken(msg.token, c.slice(5))) {
              stats.rejectedUserSubs++;
              continue;
            }
          }
          subscribe(ws, c);
        }
        break;
      }
      case 'unsub': {
        const list = Array.isArray(msg.channels) ? msg.channels.slice(0, MAX_CHANNELS_PER_CONN) : [];
        for (const c of list) unsubscribe(ws, c);
        break;
      }
      case 'pos': {
        // msg.sessionId は旧クライアント互換で届くことがあるが読まない。
        const gameId = gameIdOf(msg);
        if (!gameId) break;
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        const emoji = typeof msg.emoji === 'string' ? msg.emoji.slice(0, 8) : '🎮';
        const rotY = Number.isFinite(Number(msg.rotY)) ? Number(msg.rotY) : undefined;
        const anim =
          typeof msg.anim === 'string' && ['idle', 'walk', 'run'].includes(msg.anim)
            ? msg.anim
            : undefined;
        const name = typeof msg.name === 'string' ? msg.name.slice(0, 24) : undefined;
        const level = Number.isFinite(Number(msg.level)) ? Number(msg.level) : undefined;
        if (!ws.games.has(gameId) && ws.games.size >= MAX_CHANNELS_PER_CONN) break;
        if (updatePresence(gameId, me, x, y, emoji, rotY, anim, ws, name, level)) {
          ws.games.add(gameId);
        }
        break;
      }
      case 'leave': {
        const gameId = gameIdOf(msg);
        if (!gameId || !ws.games.has(gameId)) break;
        dropPresence(gameId, me);
        ws.games.delete(gameId);
        break;
      }
      // ── チャット（フェーズ25）。DBには一切書かない、その場で通り過ぎるだけの中継。
      // TODO(persist): 履歴を残したいなら別途保存経路の設計が要る。 ──
      case 'chat': {
        const gameId = gameIdOf(msg);
        const text = typeof msg.text === 'string' ? msg.text.slice(0, 200).trim() : '';
        // 自分が presence に載っているルームにだけ書ける
        if (!gameId || !text || !presence.get(gameId)?.has(me)) break;
        const name = typeof msg.name === 'string' ? msg.name.slice(0, 24) : '名無し';
        broadcast(
          `game:${gameId}`,
          JSON.stringify({ t: 'chat', game: gameId, playerId: me, name, text, ts: Date.now() }),
        );
        break;
      }
      // ── パーティー招待/承認/離脱（フェーズ25、インメモリのみ）。
      // 送り主は常にこの接続（me）。相手は targetPlayerId（旧クライアントは targetSessionId）。 ──
      case 'partyInvite': {
        const gameId = gameIdOf(msg);
        const targetId = typeof msg.targetPlayerId === 'string' ? msg.targetPlayerId : msg.targetSessionId;
        if (!gameId || typeof targetId !== 'string' || targetId === me) break;
        const room = presence.get(gameId);
        if (!room?.has(me)) break;
        const targetWs = room.get(targetId)?.ws;
        if (!targetWs || targetWs.readyState !== targetWs.OPEN) break;
        const key = `${gameId}\n${me}`;
        if (!targetWs.invites.has(key) && targetWs.invites.size >= MAX_PENDING_INVITES) {
          // 期限切れを掃除してから、なお溢れるなら捨てる
          for (const [k, exp] of targetWs.invites) if (exp < now) targetWs.invites.delete(k);
          if (targetWs.invites.size >= MAX_PENDING_INVITES) break;
        }
        targetWs.invites.set(key, now + INVITE_TTL_MS);
        const fromName = room.get(me)?.name ?? '名無し';
        sendTo(targetWs, { t: 'partyInvite', game: gameId, fromPlayerId: me, fromName });
        break;
      }
      case 'partyAccept': {
        const gameId = gameIdOf(msg);
        const inviterId = typeof msg.targetPlayerId === 'string' ? msg.targetPlayerId : msg.targetSessionId;
        if (!gameId || typeof inviterId !== 'string' || inviterId === me) break;
        // 招待されていない相手のパーティーへは入れない（招待は1回の承諾で使い切り）
        const key = `${gameId}\n${inviterId}`;
        const exp = ws.invites.get(key);
        ws.invites.delete(key);
        if (!exp || exp < now) break;
        const room = presence.get(gameId);
        if (!room?.has(me) || !room.has(inviterId)) break;
        if (partyOf.size >= MAX_ROOMS && !partyOf.has(gameId)) break;
        const merged = joinParty(gameId, me, inviterId);
        if (merged) broadcastPartyUpdate(gameId, merged);
        break;
      }
      case 'partyLeave': {
        const gameId = gameIdOf(msg);
        if (!gameId) break;
        leaveParty(gameId, me);
        break;
      }
      case 'ping':
        sendTo(ws, { t: 'pong' });
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    stats.connections--;
    if (ws.ip) {
      const n = (connsPerIp.get(ws.ip) ?? 1) - 1;
      if (n <= 0) connsPerIp.delete(ws.ip);
      else connsPerIp.set(ws.ip, n);
    }
    unsubscribeAll(ws);
    for (const gameId of ws.games) dropPresence(gameId, ws.playerId); // dropPresence内でleavePartyも行う
    ws.games.clear();
    ws.invites.clear();
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
    log('WARN: REALTIME_PUBLISH_SECRET is not set — /publish and user:* subscriptions will be rejected.');
  }
  log(`realtime hub listening on :${PORT} (ws path /ws)`);
});
