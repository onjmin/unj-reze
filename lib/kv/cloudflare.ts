// Cloudflare KV REST API implementation
// Requires: KV_ACCOUNT_ID, KV_NAMESPACE_ID, KV_API_TOKEN

function base(): string {
  const accountId = process.env.KV_ACCOUNT_ID!;
  const namespaceId = process.env.KV_NAMESPACE_ID!;
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
}

function headers(): HeadersInit {
  return { Authorization: `Bearer ${process.env.KV_API_TOKEN}` };
}

export async function kvGet(key: string): Promise<string | null> {
  const res = await fetch(`${base()}/values/${encodeURIComponent(key)}`, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`KV GET failed: ${res.status}`);
  return res.text();
}

export async function kvSet(key: string, value: string): Promise<void> {
  const res = await fetch(`${base()}/values/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'text/plain' },
    body: value,
  });
  if (!res.ok) throw new Error(`KV SET failed: ${res.status}`);
}

export async function kvSetEx(key: string, value: string, ttlSeconds: number): Promise<void> {
  // Cloudflare KV は expiration_ttl の最小値が 60 秒
  const ttl = Math.max(60, Math.floor(ttlSeconds));
  const res = await fetch(`${base()}/values/${encodeURIComponent(key)}?expiration_ttl=${ttl}`, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'text/plain' },
    body: value,
  });
  if (!res.ok) throw new Error(`KV SETEX failed: ${res.status}`);
}

export async function kvIncr(key: string): Promise<number> {
  const current = parseInt((await kvGet(key)) || '0', 10);
  const next = current + 1;
  await kvSet(key, String(next));
  return next;
}

export async function kvDecr(key: string): Promise<number> {
  const current = parseInt((await kvGet(key)) || '0', 10);
  const next = Math.max(0, current - 1);
  await kvSet(key, String(next));
  return next;
}

export async function kvDel(key: string): Promise<void> {
  await fetch(`${base()}/values/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: headers(),
  });
}

export async function kvExists(key: string): Promise<boolean> {
  return (await kvGet(key)) !== null;
}

export async function kvHGet(key: string, field: string): Promise<string | null> {
  const raw = await kvGet(key);
  try {
    const obj = JSON.parse(raw || '{}');
    return obj[field] ?? null;
  } catch {
    return null;
  }
}

export async function kvHSet(key: string, field: string, value: string): Promise<void> {
  const raw = await kvGet(key);
  const obj = JSON.parse(raw || '{}');
  obj[field] = value;
  await kvSet(key, JSON.stringify(obj));
}

export async function kvHDel(key: string, field: string): Promise<void> {
  const raw = await kvGet(key);
  try {
    const obj = JSON.parse(raw || '{}');
    delete obj[field];
    await kvSet(key, JSON.stringify(obj));
  } catch {}
}

export async function kvHIncr(key: string, field: string): Promise<number> {
  const raw = await kvGet(key);
  const obj = JSON.parse(raw || '{}');
  obj[field] = (parseInt(obj[field] || '0', 10) + 1).toString();
  await kvSet(key, JSON.stringify(obj));
  return parseInt(obj[field], 10);
}

export async function kvHDecr(key: string, field: string): Promise<number> {
  const raw = await kvGet(key);
  const obj = JSON.parse(raw || '{}');
  obj[field] = Math.max(0, parseInt(obj[field] || '0', 10) - 1).toString();
  await kvSet(key, JSON.stringify(obj));
  return parseInt(obj[field], 10);
}

export async function kvHGetAll(key: string): Promise<Record<string, string>> {
  const raw = await kvGet(key);
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

export async function kvDisconnect(): Promise<void> {}
