// リクエストの国コード判定 / EU(＋EEA)遮断用ヘルパ。
// proxy.ts から利用。GDPR対応コスト回避のため EU/EEA からのアクセスを 451 で遮断する。

// EU加盟27カ国 + EEA(アイスランド/リヒテンシュタイン/ノルウェー)。ISO 3166-1 alpha-2。
const BLOCKED_COUNTRIES = new Set<string>([
  // EU 27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA
  'IS', 'LI', 'NO',
]);

/**
 * CDN が付与する国コードヘッダから ISO 国コードを抽出する。
 * Cloudflare: cf-ipcountry / Vercel: x-vercel-ip-country /
 * Netlify: x-nf-geo(JSON) / 汎用: x-country。
 */
export function getCountryFromHeaders(headers: Headers): string | null {
  const cf = headers.get('cf-ipcountry');
  if (cf) return cf.toUpperCase();

  const vercel = headers.get('x-vercel-ip-country');
  if (vercel) return vercel.toUpperCase();

  const generic = headers.get('x-country');
  if (generic) return generic.toUpperCase();

  const nf = headers.get('x-nf-geo');
  if (nf) {
    try {
      const parsed = JSON.parse(nf) as { country?: { code?: string } };
      if (parsed.country?.code) return parsed.country.code.toUpperCase();
    } catch {
      /* JSON でなければ無視 */
    }
  }
  return null;
}

/** 与えられた国コードが遮断対象(EU/EEA)か。null(不明)は遮断しない。 */
export function isBlockedCountry(country: string | null): boolean {
  if (!country) return false;
  return BLOCKED_COUNTRIES.has(country.toUpperCase());
}
