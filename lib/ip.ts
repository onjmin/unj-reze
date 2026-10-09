/** クライアントIPの表記ゆれ（IPv4-mapped IPv6・ポート付き・大文字小文字）を吸収し、
 * 同一IPが常に同じ文字列で ip_address 照合できるようにする。 */
export function normalizeIp(raw: string): string {
	let ip = raw.trim();

	if (ip.startsWith("[")) {
		// "[::1]:54321" 形式
		const end = ip.indexOf("]");
		if (end !== -1) ip = ip.slice(1, end);
	} else {
		// "1.2.3.4:54321" 形式（IPv6は複数の ':' を含むため誤検出しない）
		const lastColon = ip.lastIndexOf(":");
		if (
			lastColon !== -1 &&
			ip.indexOf(":") === lastColon &&
			/^\d+$/.test(ip.slice(lastColon + 1))
		) {
			ip = ip.slice(0, lastColon);
		}
	}

	const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
	if (mapped) ip = mapped[1];

	return ip.toLowerCase();
}

/** リクエストヘッダからクライアントIPを取り出す。
 * Cloudflare Workers では `cf-connecting-ip` が最も信頼できる値。
 * Netlify やローカル開発環境へのフォールバック構造を保持。 */
export function getClientIp(headers: Headers): string {
	// X-Forwarded-For はカンマ区切りの先頭を取得
	const xForwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

	const rawIp =
		headers.get("cf-connecting-ip") || // Cloudflare 最優先
		headers.get("x-nf-real-client-ip") || // Netlify 独自ヘッダー
		headers.get("x-nf-client-connection-ip") ||
		xForwardedFor ||
		headers.get("x-real-ip") ||
		"127.0.0.1";

	return normalizeIp(rawIp);
}

/** レート制限のキー用。IPv6 は利用者1人に /64 がまるごと割り当てられるのが普通で、
 * アドレスをそのままキーにすると末尾を変えるだけで無限に枠を取り直せる。
 * なので IPv6 は先頭 /64（4グループ）に丸める。IPv4 はそのまま。 */
export function rateLimitKeyFromIp(ip: string): string {
	if (!ip.includes(":")) return ip;
	const [head, tail] = ip.split("::");
	const headGroups = head ? head.split(":") : [];
	// "::" で省略されたゼロのグループを補ってから先頭4つを取る
	const tailGroups = tail ? tail.split(":") : [];
	const missing =
		tail === undefined
			? 0
			: Math.max(0, 8 - headGroups.length - tailGroups.length);
	const groups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
	return `${groups
		.slice(0, 4)
		.map((g) => g.replace(/^0+(?=.)/, ""))
		.join(":")}::/64`;
}
