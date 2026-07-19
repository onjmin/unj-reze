const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 3000;

export interface TurnstileVerifyResult {
  success: boolean;
  /** ネットワーク断/タイムアウト等でCloudflareに問い合わせできなかった場合 true。
   * 呼び出し側は fail-open するか（レイテンシ優先）fail-closed するかをここで判断する。 */
  unreachable: boolean;
  errorCodes: string[];
}

/**
 * Turnstile トークンを Cloudflare の siteverify エンドポイントで検証する。
 * ダウンストリームの遅延がユーザー体験を壊さないよう AbortController で確実にタイムアウトさせる。
 * TURNSTILE_SECRET_KEY 未設定時（ローカル開発など）は検証をスキップして常に成功扱いにする。
 */
export async function verifyTurnstileToken(token: string | null, remoteIp: string): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    // 開発環境などキー未設定時は検証自体を無効化（本番では必ず設定すること）
    return { success: true, unreachable: false, errorCodes: [] };
  }

  if (!token) {
    return { success: false, unreachable: false, errorCodes: ['missing-input-response'] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: remoteIp,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { success: false, unreachable: true, errorCodes: [`http-${res.status}`] };
    }

    const data = await res.json() as { success: boolean; ['error-codes']?: string[] };
    return { success: !!data.success, unreachable: false, errorCodes: data['error-codes'] || [] };
  } catch (e) {
    const isAbort = e instanceof Error && e.name === 'AbortError';
    return { success: false, unreachable: true, errorCodes: [isAbort ? 'timeout' : 'network-error'] };
  } finally {
    clearTimeout(timer);
  }
}
