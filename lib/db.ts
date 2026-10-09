import type { DataStore } from "./db/interface";
import { mockStore } from "./db/mock";

let store: DataStore | null = null;

async function getStore(): Promise<DataStore> {
	if (store) return store;

	const provider = process.env.DATABASE_PROVIDER || "mock";

	switch (provider) {
		case "neon": {
			const mod = await import("./db/pg");
			store = mod.pgStore;
			break;
		}
		case "mock":
		default:
			store = mockStore;
			break;
	}
	return store;
}

interface ErrorLike {
	message?: unknown;
	code?: unknown;
	cause?: { message?: unknown; code?: unknown };
	sourceError?: { code?: unknown };
}

function isConnError(err: unknown): boolean {
	if (!err) return false;
	const e = err as ErrorLike;
	const msg = String(e.message || err);
	const causeMsg = e.cause ? String(e.cause.message || e.cause) : "";
	const code = e.code || e.cause?.code || e.sourceError?.code;
	return (
		code === "ECONNREFUSED" ||
		msg.includes("fetch failed") ||
		msg.includes("Error connecting to database") ||
		msg.includes("ECONNREFUSED") ||
		causeMsg.includes("ECONNREFUSED")
	);
}

export const db = new Proxy<DataStore>({} as DataStore, {
	get(_target, prop: keyof DataStore) {
		return async (...args: unknown[]) => {
			const s = await getStore();
			const method = s[prop];
			if (typeof method === "function") {
				try {
					return await (method as (...args: unknown[]) => unknown).apply(
						s,
						args,
					);
				} catch (err) {
					const provider = process.env.DATABASE_PROVIDER || "mock";
					// 本番では mockStore に切り替えない。切り替えると、DB 障害中に書き込みが
					// アイソレートのメモリへ消え、閲覧者ごとに違う架空のデータが「正常」として返る
					// （障害にも気付きにくい）。エラーのまま返して呼び出し側の 500 / fail-open に任せる。
					// ローカル開発（docker の DB を上げ忘れた等）でだけ従来どおり落とす。
					if (
						provider !== "mock" &&
						isConnError(err) &&
						process.env.NODE_ENV !== "production"
					) {
						console.warn(
							`[db] Database connection failed (${provider}). Falling back to mockStore.`,
							(err as ErrorLike).message || err,
						);
						const fallbackMethod = mockStore[prop];
						if (typeof fallbackMethod === "function") {
							return (fallbackMethod as (...args: unknown[]) => unknown).apply(
								mockStore,
								args,
							);
						}
					}
					throw err;
				}
			}
			throw new Error(`Method ${String(prop)} is not a function`);
		};
	},
});
