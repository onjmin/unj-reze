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

/** IPv6 の先頭 `count` グループを、"::" の省略を展開し先頭ゼロを落とした形で返す。
 * 同じネットワークが表記ゆれ（"2001:db8::" と "2001:0db8:0:0::"）で別キーにならないようにするため。 */
function ipv6PrefixGroups(ip: string, count: number): string[] {
	const [head, tail] = ip.split("::");
	const headGroups = head ? head.split(":") : [];
	// "::" で省略されたゼロのグループを補ってから先頭 count 個を取る
	const tailGroups = tail ? tail.split(":") : [];
	const missing =
		tail === undefined
			? 0
			: Math.max(0, 8 - headGroups.length - tailGroups.length);
	const groups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
	return groups.slice(0, count).map((g) => g.replace(/^0+(?=.)/, ""));
}

/** レート制限のキー用。IPv6 は利用者1人に /64 がまるごと割り当てられるのが普通で、
 * アドレスをそのままキーにすると末尾を変えるだけで無限に枠を取り直せる。
 * なので IPv6 は先頭 /64（4グループ）に丸める。IPv4 はそのまま。 */
export function rateLimitKeyFromIp(ip: string): string {
	if (!ip.includes(":")) return ip;
	return `${ipv6PrefixGroups(ip, 4).join(":")}::/64`;
}

/** レート制限の2段目（/48）のキー。/48 や /56 を持つ利用者は /64 をいくらでも乗り換えられるので、
 * /64 の枠とは別に、上限の大きい /48 の枠でも数える（unj の ipPrefixKey と同じ考え方）。
 * IPv4 には相当する段が無いので null（呼び出し側はこの段を飛ばす）。 */
export function rateLimitKey48FromIp(ip: string): string | null {
	if (!ip.includes(":")) return null;
	return `${ipv6PrefixGroups(ip, 3).join(":")}::/48`;
}
