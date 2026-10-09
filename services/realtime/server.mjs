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
import { isIP } from 'node:net';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';

/** 数値の env。未設定・空・数値でない・負なら既定値。 */
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

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
/**
 * 1接続が presence に載れるゲーム（ルーム）の数。チャンネル数の上限とは別。
 * pos を送るのは LiveGameView と Mmo3dMaker だけで、どちらも同時に1ゲームしか開かない。
 */
const MAX_GAMES_PER_CONN = Math.max(1, envInt('MAX_GAMES_PER_CONN', 4));
const MAX_MESSAGE_BYTES = 16 * 1024;
/** 1接続あたりの受信レート上限（RATE_WINDOW_MS ごと）。 */
const RATE_LIMIT_MSGS = 120;
const RATE_WINDOW_MS = 10_000;
/** チャットだけの小さなバケット（1接続あたり毎秒1通、溜められるのは5通まで）。上の全体の上限とは別に効く。 */
const CHAT_BURST = 5;
const CHAT_PER_SEC = 1;
/** 1ルームに保持する presence の上限（メモリ暴走の防止）。 */
const MAX_PLAYERS_PER_ROOM = 200;
/** 全体の同時接続数の上限。 */
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS || 5000);
/** 1IP（IPv4 はアドレス、IPv6 は /64）あたりの同時接続数の上限。0 で無効。 */
const MAX_CONN_PER_IP = envInt('MAX_CONN_PER_IP', 20);
/** IPv6 の /48 あたりの同時接続数の上限（/64 を乗り換えられる回線向け）。既定は MAX_CONN_PER_IP の4倍、0 で無効。 */
const MAX_CONN_PER_IP48 = envInt('MAX_CONN_PER_IP48', MAX_CONN_PER_IP * 4);
/** チャンネル表（channel -> 購読者）の総数の上限。存在しないチャンネルを大量に作らせない。 */
const MAX_TOTAL_CHANNELS = Number(process.env.MAX_TOTAL_CHANNELS || 20_000);
/** ルーム（presence / パーティー）の総数の上限。 */
const MAX_ROOMS = Math.max(1, envInt('MAX_ROOMS', 2_000));
/**
 * IP キー（MAX_CONN_PER_IP と同じ単位）ごとの予算。全体の表（ルーム・チャンネル）を
 * 少数の IP で埋められないようにする。0 で無効。超えた分は他の上限と同じく黙って無視する。
 *   - ルーム: その IP が作って、まだ残っているルームの数（空になって消えたら返る）
 *   - チャンネル: その IP の全接続が購読しているチャンネルの合計（unsub・切断で返る）
 * IPv6 は /64 ごとの予算に加えて /48 ごとの予算（既定はそれぞれの4倍）も掛ける（/64 を乗り換えて
 * 予算を増やせないように）。MAX_CONN_PER_IP=0（IP 単位の制限を止めるスイッチ）なら既定は全部 0。
 */
const MAX_ROOMS_PER_IP = envInt('MAX_ROOMS_PER_IP', MAX_CONN_PER_IP > 0 ? 16 : 0);
const MAX_CHANNELS_PER_IP = envInt('MAX_CHANNELS_PER_IP', MAX_CONN_PER_IP > 0 ? 128 : 0);
const MAX_ROOMS_PER_IP48 = envInt('MAX_ROOMS_PER_IP48', MAX_ROOMS_PER_IP * 4);
const MAX_CHANNELS_PER_IP48 = envInt('MAX_CHANNELS_PER_IP48', MAX_CHANNELS_PER_IP * 4);
/** パーティー招待の有効期限。 */
const INVITE_TTL_MS = 60_000;
/** 1接続が抱えておける未承諾の招待の数。 */
const MAX_PENDING_INVITES = 16;

/**
 * クライアントIPの取り方。
 *   - `xff`（既定）: X-Forwarded-For を右から見ていく。TRUSTED_PROXY_HOPS は以前と同じく
 *     「右から何番目から見るか」（内部アドレスも1つと数える。既定 1 = 末尾）。そこから左へ、
 *     プライベート/内部アドレスだけは飛ばして、最初の公開アドレスをクライアントとする。
 *     Koyeb は「Koyeb へ繋いできた IP」を末尾に足し、その後ろに内部ホップ（社内 LB 等の
 *     プライベートアドレス）を足すことがあるので、既定の 1 のままそれを飛ばせる。
 *     開始位置より右（信頼するプロキシが足した分）は公開アドレスでも採らず、開始位置より左へ
 *     進むのは内部アドレスを飛ばすときだけ（公開アドレスを1つ飛ばして、クライアントが自由に書ける
 *     左側を採ることはない）。IP として不正な値に当たったらそこで止める（＝不明）。
 *     要素が TRUSTED_PROXY_HOPS 個に足りない・ヘッダが無いときはソケットの接続元（以前と同じ）。
 *   - `socket`: ソケットの接続元。プロキシの後ろでは全員が同じIPになるので使わないこと。
 * 公開アドレスが取れなかったときは「不明」とし、IP 単位の上限・予算は掛けない
 * （プロキシ構成の読み違いで全員が1IPに見え、20接続で全停止するのを避ける fail-open）。
 * 不明になった接続はプロセスごとに1回だけログに出し、件数を /healthz の統計に出す。
 */
const CLIENT_IP_SOURCE = process.env.CLIENT_IP_SOURCE || 'xff';
const TRUSTED_PROXY_HOPS = Math.max(1, envInt('TRUSTED_PROXY_HOPS', 1));

/**
 * 購読できるチャンネル名。lib/realtime/channels.ts の関数が組み立てる形だけを通す。
 * ID は数値か sqids（英数字）なので、それ以外の文字や長すぎる名前は弾く。
 */
const CHANNEL_RE = /^(?:feed|(?:thread|game|user):[A-Za-z0-9_-]{1,64})$/;
const GAME_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** user:<id> 購読トークンの有効期限の上限（発行側は約1時間）。これより先の期限は偽物扱い。 */
const USER_TOKEN_MAX_TTL_SEC = 2 * 60 * 60;
/**
 * `1` のとき、user:<id> 購読をトークンの期限で外す（heartbeat ごとに確認）。期限の少し前に
 * `{t:'resub', channel}` を送ってトークンの取り直しを促し、期限を過ぎたら購読を外して
 * もう一度 resub を送る。resub を知らない旧クライアントは期限で push が止まるので既定は無効。
 * 新しいクライアント（lib/realtime/client.ts）が行き渡ってから有効にすること。
 */
const ENFORCE_USER_SUB_EXPIRY = process.env.ENFORCE_USER_SUB_EXPIRY === '1';
/** 期限のこれだけ手前で resub を送る（heartbeat 2回分。クライアントは期限5分前からトークンを取り直す）。 */
const RESUB_AHEAD_SEC = (2 * HEARTBEAT_MS) / 1000;

/** channel -> Set<ws> */
const channels = new Map();
/** gameId -> Map<playerId, {x, y, emoji, ts, ws, name}> */
const presence = new Map();
/** gameId -> ルームの帰属 {key: IP キー, key48: IPv6 /48 か null, playerId}。作った人が抜けたら残っている人へ移す。 */
const roomOwner = new Map();
/** 直近の tick 以降に変化のあったゲームID */
const dirtyRooms = new Set();
/** IP キー（IPv4 / IPv6 の /64）-> 同時接続数 */
const connsPerIp = new Map();
/** IPv6 の /48 -> 同時接続数 */
const connsPerIp48 = new Map();
/** IP キー -> 帰属しているルーム数（MAX_ROOMS_PER_IP） */
const roomsPerIp = new Map();
/** IP キー -> 全接続の購読チャンネル数の合計（MAX_CHANNELS_PER_IP） */
const channelsPerIp = new Map();
/** IPv6 の /48 -> 帰属しているルーム数（MAX_ROOMS_PER_IP48） */
const roomsPer48 = new Map();
/** IPv6 の /48 -> 全接続の購読チャンネル数の合計（MAX_CHANNELS_PER_IP48） */
const channelsPer48 = new Map();

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
  unknownIpConnections: 0,
  expiredUserSubs: 0,
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

/** 正しければトークンの期限（Unix 秒）、だめなら 0。 */
function verifyUserToken(token, userId) {
  if (!PUBLISH_SECRET || typeof token !== 'string' || token.length > 256) return 0;
  const parts = token.split('.');
  if (parts.length !== 3) return 0;
  const [tokUser, expStr, sig] = parts;
  if (tokUser !== userId) return 0;
  if (!/^\d{1,12}$/.test(expStr)) return 0;
  const exp = Number(expStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (exp < nowSec || exp > nowSec + USER_TOKEN_MAX_TTL_SEC) return 0;
  const expected = createHmac('sha256', PUBLISH_SECRET)
    .update(`user:${tokUser}.${expStr}`)
    .digest('base64url');
  return safeEqual(sig, expected) ? exp : 0;
}

// ── クライアントIP / 接続数 ──────────────────────────────────────

/** IPv6 を 8 グループ（数値）に展開する。末尾が IPv4 表記（::ffff:1.2.3.4 等）でもよい。不正なら null。 */
function expandIPv6(ip) {
  let s = ip.split('%')[0]; // ゾーンID
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    s = `${s.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail].map((g) => Number.parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => !(g >= 0 && g <= 0xffff))) return null;
  return groups;
}

/** IP として正しいものだけ返す。IPv4 射影（::ffff:a.b.c.d / ::ffff:xxxx:xxxx）は IPv4 に揃える。 */
function normalizeIp(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const kind = isIP(s);
  if (kind === 4) return s;
  if (kind !== 6) return null;
  const g = expandIPv6(s);
  if (!g) return null;
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
  }
  return s.toLowerCase();
}

/** 内部ネットワーク・ループバック等（クライアントの公開IPにはなりえない）。normalizeIp 済みの値を渡す。 */
function isPrivateIp(ip) {
  if (!ip) return true;
  if (isIP(ip) === 4) {
    if (/^(0\.|10\.|127\.|192\.168\.|169\.254\.)/.test(ip)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true; // CGNAT（内部網でよく使われる）
    return false;
  }
  const g = expandIPv6(ip);
  if (!g) return true;
  if (g.slice(0, 7).every((x) => x === 0) && g[7] <= 1) return true; // :: / ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7（ULA）
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10（リンクローカル）
  return false;
}

/** 接続数・予算を数える単位。IPv4 はそのまま、IPv6 は /64（1回線に配られる単位。その中ではアドレスを変え放題）。 */
function ipKeyOf(ip) {
  if (isIP(ip) !== 6) return ip;
  const g = expandIPv6(ip);
  return g ? `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64` : ip;
}

/** IPv6 の /48（1拠点に配られる最大の単位。/48 や /56 を持つと /64 を乗り換えられる）。IPv4 は null。 */
function ip48KeyOf(ip) {
  if (isIP(ip) !== 6) return null;
  const g = expandIPv6(ip);
  return g ? `${g.slice(0, 3).map((x) => x.toString(16)).join(':')}::/48` : null;
}

function publicOrNull(raw) {
  const ip = normalizeIp(raw);
  return ip && !isPrivateIp(ip) ? ip : null;
}

/** クライアントの公開IP（normalizeIp 済み）。取れなければ null（IP 単位の上限・予算を掛けない）。 */
function clientIpOf(req) {
  if (CLIENT_IP_SOURCE === 'socket') return publicOrNull(req.socket.remoteAddress);
  const xff = req.headers['x-forwarded-for'];
  const list = (Array.isArray(xff) ? xff.join(',') : xff || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // 要素が足りないときは以前と同じくソケットの接続元（左に足せるのはクライアントなので、偽装で短くはできない）
  if (list.length < TRUSTED_PROXY_HOPS) return publicOrNull(req.socket.remoteAddress);
  // 右から TRUSTED_PROXY_HOPS 番目（以前と同じ位置。内部アドレスも数える）から左へ。
  // 進むのは内部ホップを飛ばすときだけで、最初の公開アドレスで止まる（以前より左を採るのは、
  // 以前なら内部アドレスを拾って「不明」になっていた場合だけ）。
  for (let i = list.length - TRUSTED_PROXY_HOPS; i >= 0; i--) {
    const ip = normalizeIp(list[i]);
    if (!ip) return null; // IP でない値 → 構成を読み違えている。これより左（偽装しうる側）は見ない
    if (!isPrivateIp(ip)) return ip;
  }
  return null;
}

let warnedUnknownIp = false;
/** 公開IPが取れなかった接続（fail-open で IP 単位の上限なし）。ログはプロセスごとに1回だけ。 */
function noteUnknownIp(req) {
  stats.unknownIpConnections++;
  if (warnedUnknownIp) return;
  warnedUnknownIp = true;
  log(
    `client ip unknown; per-ip limits are not applied to such connections (logged once) xff=${req.headers['x-forwarded-for'] ?? '-'} remote=${req.socket.remoteAddress ?? '-'}`,
  );
}

function incCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function decCount(map, key, by = 1) {
  const n = (map.get(key) ?? 0) - by;
  if (n <= 0) map.delete(key);
  else map.set(key, n);
}

/** IP キーの予算が残っているか。キーが無い（IP 不明）・上限 0 なら制限しない。 */
function underBudget(map, key, max) {
  return !key || max <= 0 || (map.get(key) ?? 0) < max;
}

// ── チャンネル購読 ───────────────────────────────────────────────

/** 購読する。購読できた（既に購読中を含む）なら true。上限に当たったら黙って false。 */
function subscribe(ws, channel) {
  if (typeof channel !== 'string' || !CHANNEL_RE.test(channel)) return false;
  if (ws.channels.has(channel)) return true;
  if (ws.channels.size >= MAX_CHANNELS_PER_CONN) return false;
  if (!underBudget(channelsPerIp, ws.ipKey, MAX_CHANNELS_PER_IP)) return false;
  if (!underBudget(channelsPer48, ws.ip48, MAX_CHANNELS_PER_IP48)) return false;
  let set = channels.get(channel);
  if (!set) {
    if (channels.size >= MAX_TOTAL_CHANNELS) return false;
    set = new Set();
    channels.set(channel, set);
  }
  ws.channels.add(channel);
  set.add(ws);
  if (ws.ipKey) incCount(channelsPerIp, ws.ipKey);
  if (ws.ip48) incCount(channelsPer48, ws.ip48);
  return true;
}

function unsubscribe(ws, channel) {
  if (typeof channel !== 'string') return;
  if (!ws.channels.delete(channel)) return;
  ws.userSubs.delete(channel);
  if (ws.ipKey) decCount(channelsPerIp, ws.ipKey);
  if (ws.ip48) decCount(channelsPer48, ws.ip48);
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
  if (ws.ipKey) decCount(channelsPerIp, ws.ipKey, ws.channels.size);
  if (ws.ip48) decCount(channelsPer48, ws.ip48, ws.channels.size);
  ws.channels.clear();
  ws.userSubs.clear();
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

/** この接続の IP キー（と IPv6 なら /48）に、ルームをもう1つ数える余地があるか。 */
function roomBudgetLeft(ws) {
  return (
    underBudget(roomsPerIp, ws.ipKey, MAX_ROOMS_PER_IP) &&
    underBudget(roomsPer48, ws.ip48, MAX_ROOMS_PER_IP48)
  );
}

/** ルームを取る。無ければ作る（全体の上限と、作る接続の IP キーの予算の範囲で）。 */
function roomOf(gameId, ws) {
  let room = presence.get(gameId);
  if (!room) {
    if (presence.size >= MAX_ROOMS) return null;
    if (!roomBudgetLeft(ws)) return null;
    room = new Map();
    presence.set(gameId, room);
    setRoomOwner(gameId, ws, ws.playerId);
  }
  return room;
}

function setRoomOwner(gameId, ws, playerId) {
  if (!ws.ipKey) return;
  roomOwner.set(gameId, { key: ws.ipKey, key48: ws.ip48, playerId });
  incCount(roomsPerIp, ws.ipKey);
  if (ws.ip48) incCount(roomsPer48, ws.ip48);
}

function releaseRoomOwner(gameId) {
  const owner = roomOwner.get(gameId);
  if (!owner) return;
  roomOwner.delete(gameId);
  decCount(roomsPerIp, owner.key);
  if (owner.key48) decCount(roomsPer48, owner.key48);
}

function deleteRoom(gameId) {
  presence.delete(gameId);
  releaseRoomOwner(gameId);
  dirtyRooms.add(gameId); // 最後に空の presence を配る
}

/**
 * ルームから1人外す。空になったルームはその場で消して IP キーの予算を返す。
 * 帰属先（作った人）がもういないのにルームが残っているなら、残っている人のうち予算に余裕の
 * ある人の IP キーへ帰属を移す（抜けた人の予算は返り、ルームは移った先の予算に数える）。
 * 余裕のある人がいなければ抜けた人の IP キーに数えたままにして、次に誰かが抜けたときに移し直す
 * （予算を超えて押し付けられないように）。
 */
function removeFromRoom(gameId, room, playerId) {
  if (!room.delete(playerId)) return;
  dirtyRooms.add(gameId);
  if (room.size === 0) {
    deleteRoom(gameId);
    return;
  }
  const owner = roomOwner.get(gameId);
  if (!owner || room.has(owner.playerId)) return;
  for (const [pid, e] of room) {
    if (e.ws?.ipKey && roomBudgetLeft(e.ws)) {
      releaseRoomOwner(gameId);
      setRoomOwner(gameId, e.ws, pid);
      return;
    }
  }
}

function updatePresence(gameId, playerId, x, y, emoji, rotY, anim, ws, name, level) {
  const room = roomOf(gameId, ws);
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
  if (room) removeFromRoom(gameId, room, playerId);
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
      if (now - entry.ts > PRESENCE_TTL_MS) removeFromRoom(gameId, room, playerId);
    }
    if (room.size === 0 && presence.get(gameId) === room) deleteRoom(gameId);
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

async function handleHttp(req, res) {
  // パスは request-target を `?` で切るだけで取る。`new URL(req.url, 'http://' + Host)` は
  // `GET ///` や `Host: example.com:abc` で例外を投げ、async ハンドラの未処理 reject で
  // プロセスごと落ちていた（URL パーサも Host ヘッダも使わない）。
  let pathname = (req.url || '/').split('?')[0];
  if (!pathname.startsWith('/')) {
    // absolute-form（`GET http://h/healthz`）はパス部分だけ見る。それ以外の形はそのまま（404）
    const m = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*(\/.*)?$/.exec(pathname);
    if (m) pathname = m[1] || '/';
  }

  if (req.method === 'GET' && (pathname === '/healthz' || pathname === '/')) {
    // 既定は死活だけ。内部統計（接続数・部屋数など）は管理用シークレットがあるときだけ返す
    // （攻撃の効き具合を外から測らせない）。
    const adminHeader = req.headers['x-admin-secret'];
    if (!safeEqual(typeof adminHeader === 'string' ? adminHeader : '', ADMIN_SECRET)) {
      sendJson(res, 200, { ok: true });
      return;
    }
    let presenceCount = 0;
    for (const room of presence.values()) presenceCount += room.size;
    const maxOf = (map) => {
      let m = 0;
      for (const n of map.values()) m = Math.max(m, n);
      return m;
    };
    sendJson(res, 200, {
      ok: true,
      uptimeSec: Math.floor((Date.now() - stats.startedAt) / 1000),
      connections: stats.connections,
      // IP が正しく取れているかの確認用（全員が同じIPに見えていたら ips が 1 になる）
      ips: connsPerIp.size,
      maxConnPerIp: maxOf(connsPerIp),
      ip48s: connsPerIp48.size,
      maxConnPerIp48: maxOf(connsPerIp48),
      // 公開IPが取れず IP 上限を掛けなかった接続の累計（多いなら TRUSTED_PROXY_HOPS / CLIENT_IP_SOURCE を見直す）
      unknownIpConnections: stats.unknownIpConnections,
      channels: channels.size,
      maxChannelsPerIp: maxOf(channelsPerIp),
      maxChannelsPerIp48: maxOf(channelsPer48),
      rooms: presence.size,
      maxRoomsPerIp: maxOf(roomsPerIp),
      maxRoomsPerIp48: maxOf(roomsPer48),
      players: presenceCount,
      published: stats.published,
      delivered: stats.delivered,
      rejectedConnections: stats.rejectedConnections,
      rejectedUserSubs: stats.rejectedUserSubs,
      expiredUserSubs: stats.expiredUserSubs,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/publish') {
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
}

const server = http.createServer(async (req, res) => {
  try {
    await handleHttp(req, res);
  } catch (e) {
    // 1リクエストの想定外の例外でハブ全体（全 WS）を落とさない
    log('http handler error:', e instanceof Error ? e.message : String(e));
    if (res.headersSent) {
      res.destroy();
      return;
    }
    try {
      sendJson(res, 500, { error: 'internal error' });
    } catch {
      res.destroy();
    }
  }
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

/** チャット1通ぶんのトークンを取る（毎秒 CHAT_PER_SEC 通ずつ溜まり、最大 CHAT_BURST 通）。無ければ false。 */
function takeChatToken(ws, now) {
  ws.chatTokens = Math.min(CHAT_BURST, ws.chatTokens + ((now - ws.chatRefillAt) / 1000) * CHAT_PER_SEC);
  ws.chatRefillAt = now;
  if (ws.chatTokens < 1) return false;
  ws.chatTokens -= 1;
  return true;
}

/**
 * user:<id> 購読のトークン期限を見る（ENFORCE_USER_SUB_EXPIRY=1 のときだけ heartbeat から呼ぶ）。
 * 期限の RESUB_AHEAD_SEC 前に1回 resub を送って取り直しを促し（購読は残す）、
 * 期限を過ぎたら購読を外してもう一度 resub を送る。
 */
function expireUserSubs(ws, nowSec) {
  if (!ws.userSubs || ws.userSubs.size === 0) return;
  for (const [channel, sub] of ws.userSubs) {
    if (sub.exp <= nowSec) {
      unsubscribe(ws, channel); // userSubs からも消える
      stats.expiredUserSubs++;
      sendTo(ws, { t: 'resub', channel });
    } else if (!sub.hinted && sub.exp - nowSec <= RESUB_AHEAD_SEC) {
      sub.hinted = true;
      sendTo(ws, { t: 'resub', channel });
    }
  }
}

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) {
    ws.close(1008, 'origin not allowed');
    return;
  }

  const ip = clientIpOf(req);
  const ipKey = ip ? ipKeyOf(ip) : null;
  const ip48 = ip ? ip48KeyOf(ip) : null;
  if (stats.connections >= MAX_CONNECTIONS) {
    logReject('global cap', req, ip);
    ws.close(1013, 'server busy');
    return;
  }
  if (ipKey && MAX_CONN_PER_IP > 0 && (connsPerIp.get(ipKey) ?? 0) >= MAX_CONN_PER_IP) {
    logReject('per-ip cap', req, ip);
    ws.close(1008, 'too many connections');
    return;
  }
  if (ip48 && MAX_CONN_PER_IP48 > 0 && (connsPerIp48.get(ip48) ?? 0) >= MAX_CONN_PER_IP48) {
    logReject('per-ip48 cap', req, ip);
    ws.close(1008, 'too many connections');
    return;
  }
  if (!ip) noteUnknownIp(req);
  ws.ipKey = ipKey;
  ws.ip48 = ip48;
  if (ipKey) incCount(connsPerIp, ipKey);
  if (ip48) incCount(connsPerIp48, ip48);

  // この接続の公開ID。presence/チャット/パーティーで他人に見せるのはこれだけ。
  // クライアントが名乗るIDは一切読まないので、他人のふりはできない。
  ws.playerId = randomUUID();
  ws.channels = new Set();
  /** user:<id> 購読 -> {exp: トークンの期限(Unix秒), hinted: 期限前の resub を送ったか} */
  ws.userSubs = new Map();
  ws.games = new Set(); // presence に載っている gameId（切断時に消すため）
  /** 自分宛の未承諾の招待。`${gameId}\n${fromPlayerId}` -> 期限(ms) */
  ws.invites = new Map();
  ws.isAlive = true;
  ws.rateCount = 0;
  ws.rateWindowStart = Date.now();
  ws.chatTokens = CHAT_BURST;
  ws.chatRefillAt = Date.now();
  stats.connections++;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  sendTo(ws, { t: 'welcome', presenceTtlMs: PRESENCE_TTL_MS, playerId: ws.playerId });

  ws.on('message', (raw) => {
    try {
      onMessage(raw);
    } catch (e) {
      // 1通の想定外の例外でハブ全体を落とさない
      log('message handler error:', e instanceof Error ? e.message : String(e));
    }
  });

  function onMessage(raw) {
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
            const exp = verifyUserToken(msg.token, c.slice(5));
            if (!exp) {
              stats.rejectedUserSubs++;
              continue;
            }
            // 期限を覚えておく（ENFORCE_USER_SUB_EXPIRY）。購読中に新しいトークンで sub し直せば延びる。
            if (subscribe(ws, c)) {
              const prev = ws.userSubs.get(c);
              if (!prev || exp > prev.exp) ws.userSubs.set(c, { exp, hinted: false });
            }
            continue;
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
        if (!ws.games.has(gameId) && ws.games.size >= MAX_GAMES_PER_CONN) {
          // TTL で presence から消えた（leave が届かなかった）ゲームは数えない
          for (const g of ws.games) {
            if (presence.get(g)?.has(me)) continue;
            leaveParty(g, me);
            ws.games.delete(g);
          }
          if (ws.games.size >= MAX_GAMES_PER_CONN) break;
        }
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
        if (!takeChatToken(ws, now)) break;
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
  }

  ws.on('close', () => {
    stats.connections--;
    if (ws.ipKey) decCount(connsPerIp, ws.ipKey);
    if (ws.ip48) decCount(connsPerIp48, ws.ip48);
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
  const nowSec = Math.floor(Date.now() / 1000);
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
    if (ENFORCE_USER_SUB_EXPIRY) expireUserSubs(ws, nowSec);
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
// 取りこぼした reject で Node 22 が exit しないようにログだけ出す（uncaughtException は握りつぶさない）
process.on('unhandledRejection', (e) => {
  log('unhandledRejection:', e instanceof Error ? (e.stack ?? e.message) : String(e));
});

server.listen(PORT, () => {
  if (!PUBLISH_SECRET) {
    log('WARN: REALTIME_PUBLISH_SECRET is not set — /publish and user:* subscriptions will be rejected.');
  }
  log(`realtime hub listening on :${PORT} (ws path /ws)`);
});
