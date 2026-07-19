/** クライアントIPの表記ゆれ（IPv4-mapped IPv6・ポート付き・大文字小文字）を吸収し、
 * 同一IPが常に同じ文字列で ip_address 照合できるようにする。 */
export function normalizeIp(raw: string): string {
  let ip = raw.trim();

  if (ip.startsWith('[')) {
    // "[::1]:54321" 形式
    const end = ip.indexOf(']');
    if (end !== -1) ip = ip.slice(1, end);
  } else {
    // "1.2.3.4:54321" 形式（IPv6は複数の ':' を含むため誤検出しない）
    const lastColon = ip.lastIndexOf(':');
    if (lastColon !== -1 && ip.indexOf(':') === lastColon && /^\d+$/.test(ip.slice(lastColon + 1))) {
      ip = ip.slice(0, lastColon);
    }
  }

  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) ip = mapped[1];

  return ip.toLowerCase();
}

/** リクエストヘッダからクライアントIPを取り出す。
 * x-nf-real-client-ip は netlify/edge-functions/inject-client-ip.ts が Netlify の
 * context.ip を詰め替えたもので、内部ロードバランサーのアドレスに化けない唯一信頼できる値。
 * 未設定（ローカル開発など）の場合は他ヘッダにフォールバックする。 */
export function getClientIp(headers: Headers): string {
  return normalizeIp(
    headers.get('x-nf-real-client-ip') ||
    headers.get('x-nf-client-connection-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}
