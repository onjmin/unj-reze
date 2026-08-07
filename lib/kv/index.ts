// KV_PROVIDER=mock (default) | cloudflare

type KVModule = typeof import("./mock");

let impl: KVModule | null = null;

async function getImpl(): Promise<KVModule> {
	if (impl) return impl;
	if (process.env.KV_PROVIDER === "cloudflare") {
		impl = (await import("./cloudflare")) as KVModule;
	} else {
		impl = await import("./mock");
	}
	return impl;
}

export async function kvGet(key: string) {
	return (await getImpl()).kvGet(key);
}
export async function kvSet(key: string, value: string) {
	return (await getImpl()).kvSet(key, value);
}
export async function kvSetEx(key: string, value: string, ttlSeconds: number) {
	return (await getImpl()).kvSetEx(key, value, ttlSeconds);
}
export async function kvIncr(key: string) {
	return (await getImpl()).kvIncr(key);
}
export async function kvDecr(key: string) {
	return (await getImpl()).kvDecr(key);
}
export async function kvDel(key: string) {
	return (await getImpl()).kvDel(key);
}
export async function kvExists(key: string) {
	return (await getImpl()).kvExists(key);
}
export async function kvHGet(key: string, field: string) {
	return (await getImpl()).kvHGet(key, field);
}
export async function kvHSet(key: string, field: string, value: string) {
	return (await getImpl()).kvHSet(key, field, value);
}
export async function kvHDel(key: string, field: string) {
	return (await getImpl()).kvHDel(key, field);
}
export async function kvHIncr(key: string, field: string) {
	return (await getImpl()).kvHIncr(key, field);
}
export async function kvHDecr(key: string, field: string) {
	return (await getImpl()).kvHDecr(key, field);
}
export async function kvHGetAll(key: string) {
	return (await getImpl()).kvHGetAll(key);
}
export async function kvDisconnect() {
	return (await getImpl()).kvDisconnect();
}
