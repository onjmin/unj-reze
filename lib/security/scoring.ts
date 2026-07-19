import { kvGet, kvSetEx, kvHSet, kvHDel, kvHGetAll } from '@/lib/kv';
import type { FingerprintSignals, ScoreResult } from './types';

const IP_HOP_WINDOW_MS = 10 * 60 * 1000; // 10分
const IP_HOP_THRESHOLD = 5; // 同一指紋で10分以内に異なるIPが5個以上 → IPローテーションの疑い

const SESSION_RECYCLE_WINDOW_MS = 30 * 60 * 1000; // 30分
const SESSION_RECYCLE_THRESHOLD = 4; // 同一指紋で30分以内に異なるsessionIdが4個以上 → シークレットタブ使い回しの疑い

const RATE_WINDOW_SEC = 10;
const RATE_SOFT_LIMIT = 20; // 同一指紋からのアクション数ソフト上限/10秒

// TLS指紋が取得できない場合のフォールバック: 既知のボット/HTTPクライアントのUser-Agent断片
const BOT_UA_PATTERNS = [
  /curl/i, /python-requests/i, /go-http-client/i, /axios/i,
  /node-fetch/i, /puppeteer/i, /headlesschrome/i, /playwright/i,
];

// 「一般的なブラウザ」として知られるJA4指紋のプレフィックス例。
// 実運用では既知ハッシュのデータベース/専用サービスと突き合わせる。ここでは代表例のみ。
const KNOWN_BROWSER_JA4_PREFIXES = ['t13d1516h2_', 't13d1517h2_', 't13d1715h2_'];

/** 高速・決定的な文字列ハッシュ（FNV-1a 32bit）。暗号強度は不要で速度を優先する。 */
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 指紋シグナルを正規化した上でハッシュ化する。フィールド順を固定しているため
 * 同じデバイス/ブラウザからは常に同じハッシュになる（canvasは固定サイズ描画が前提）。 */
export function computeFingerprintHash(fp: FingerprintSignals): string {
  const canonical = JSON.stringify({
    canvas: fp.canvas,
    webglVendor: fp.webglVendor,
    webglRenderer: fp.webglRenderer,
    hardwareConcurrency: fp.hardwareConcurrency,
    deviceMemory: fp.deviceMemory,
    screen: fp.screen,
    timezone: fp.timezone,
    language: fp.language,
    platform: fp.platform,
  });
  return fnv1aHash(canonical);
}

function isBotUserAgent(userAgent: string): boolean {
  return BOT_UA_PATTERNS.some(re => re.test(userAgent));
}

/** null = TLS指紋が取得できず判定不能（Netlify単体構成など）。true/falseはブラウザ標準ハンドシェイクとの一致可否。 */
function looksLikeBrowserTls(ja4: string | null): boolean | null {
  if (!ja4) return null;
  return KNOWN_BROWSER_JA4_PREFIXES.some(p => ja4.startsWith(p));
}

interface ScoreInput {
  fingerprint: FingerprintSignals;
  ip: string;
  sessionId: string | null;
  userAgent: string;
  ja4: string | null;
  turnstileOk: boolean;
  turnstileUnreachable: boolean;
}

/** タイムスタンプ付きハッシュマップから期限切れのフィールドを間引く。 */
async function pruneStale(key: string, entries: Record<string, string>, windowMs: number, now: number) {
  await Promise.all(
    Object.entries(entries)
      .filter(([, ts]) => now - Number(ts) >= windowMs)
      .map(([field]) => kvHDel(key, field))
  );
}

export async function scoreRequest(input: ScoreInput): Promise<ScoreResult> {
  const { fingerprint, ip, sessionId, userAgent, ja4, turnstileOk, turnstileUnreachable } = input;
  const hash = computeFingerprintHash(fingerprint);
  const now = Date.now();
  const reasons: string[] = [];
  let score = 0;

  if (!turnstileOk) {
    // Turnstile自体がタイムアウト等で判定不能な場合はレイテンシ優先で軽い減点に留める（fail-soft）
    score += turnstileUnreachable ? 10 : 40;
    reasons.push(turnstileUnreachable ? 'turnstile-unreachable' : 'turnstile-failed');
  }

  // ── Pattern A: IP Hopping（同一指紋のまま複数IPを行き来する） ──
  const ipMapKey = `fp:${hash}:ips`;
  await kvHSet(ipMapKey, ip, String(now));
  const ipEntries = await kvHGetAll(ipMapKey);
  await pruneStale(ipMapKey, ipEntries, IP_HOP_WINDOW_MS, now);
  const recentIpCount = Object.entries(ipEntries).filter(([, ts]) => now - Number(ts) < IP_HOP_WINDOW_MS).length;
  if (recentIpCount >= IP_HOP_THRESHOLD) {
    score += 35;
    reasons.push(`ip-hopping:${recentIpCount}-ips`);
  }

  // ── Pattern C: Incognito Recycling（同一指紋のまま複数sessionIdを行き来する） ──
  if (sessionId) {
    const sessionMapKey = `fp:${hash}:sessions`;
    await kvHSet(sessionMapKey, sessionId, String(now));
    const sessionEntries = await kvHGetAll(sessionMapKey);
    await pruneStale(sessionMapKey, sessionEntries, SESSION_RECYCLE_WINDOW_MS, now);
    const recentSessionCount = Object.entries(sessionEntries).filter(([, ts]) => now - Number(ts) < SESSION_RECYCLE_WINDOW_MS).length;
    if (recentSessionCount >= SESSION_RECYCLE_THRESHOLD) {
      score += 20;
      reasons.push(`session-recycling:${recentSessionCount}-sessions`);
    }
  }

  // ── Pattern B: User-Agent / TLS mismatch ──
  const claimsBrowser = !isBotUserAgent(userAgent);
  const tlsLooksBrowser = looksLikeBrowserTls(ja4);
  if (claimsBrowser && tlsLooksBrowser === false) {
    score += 40;
    reasons.push('ua-tls-mismatch');
  } else if (!claimsBrowser) {
    score += 30;
    reasons.push('bot-user-agent');
  }

  // ── レートリミット（このスコアリング系を通過するアクションの頻度） ──
  const windowIndex = Math.floor(now / (RATE_WINDOW_SEC * 1000));
  const rateKey = `fp:${hash}:rate:${windowIndex}`;
  const countStr = await kvGet(rateKey);
  const count = (countStr ? parseInt(countStr, 10) : 0) + 1;
  await kvSetEx(rateKey, String(count), RATE_WINDOW_SEC * 2);
  const rateLimited = count > RATE_SOFT_LIMIT;
  if (rateLimited) reasons.push(`rate-limit:${count}/${RATE_WINDOW_SEC}s`);

  score = Math.min(100, score);

  return {
    score,
    blocked: score >= 80,
    rateLimited,
    reasons,
    fingerprintHash: hash,
  };
}
