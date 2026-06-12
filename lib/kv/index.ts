const store = new Map<string, string>();

export async function kvGet(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function kvIncr(key: string): Promise<number> {
  const val = parseInt(store.get(key) || '0', 10) + 1;
  store.set(key, String(val));
  return val;
}

export async function kvDecr(key: string): Promise<number> {
  const val = Math.max(0, parseInt(store.get(key) || '0', 10) - 1);
  store.set(key, String(val));
  return val;
}

export async function kvDel(key: string): Promise<void> {
  store.delete(key);
}

export async function kvExists(key: string): Promise<boolean> {
  return store.has(key);
}

export async function kvHGet(key: string, field: string): Promise<string | null> {
  try {
    const obj = JSON.parse(store.get(key) || '{}');
    return obj[field] ?? null;
  } catch {
    return null;
  }
}

export async function kvHSet(key: string, field: string, value: string): Promise<void> {
  const obj = JSON.parse(store.get(key) || '{}');
  obj[field] = value;
  store.set(key, JSON.stringify(obj));
}

export async function kvHDel(key: string, field: string): Promise<void> {
  try {
    const obj = JSON.parse(store.get(key) || '{}');
    delete obj[field];
    store.set(key, JSON.stringify(obj));
  } catch {}
}

export async function kvHIncr(key: string, field: string): Promise<number> {
  const obj = JSON.parse(store.get(key) || '{}');
  obj[field] = (parseInt(obj[field] || '0', 10) + 1).toString();
  store.set(key, JSON.stringify(obj));
  return parseInt(obj[field], 10);
}

export async function kvHDecr(key: string, field: string): Promise<number> {
  const obj = JSON.parse(store.get(key) || '{}');
  obj[field] = Math.max(0, parseInt(obj[field] || '0', 10) - 1).toString();
  store.set(key, JSON.stringify(obj));
  return parseInt(obj[field], 10);
}

export async function kvHGetAll(key: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(store.get(key) || '{}');
  } catch {
    return {};
  }
}

export async function kvDisconnect(): Promise<void> {
  store.clear();
}
