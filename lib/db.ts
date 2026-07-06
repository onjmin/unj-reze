import type { DataStore } from './db/interface';
import { mockStore } from './db/mock';

let store: DataStore | null = null;

async function getStore(): Promise<DataStore> {
  if (store) return store;

  const provider = process.env.DATABASE_PROVIDER || 'mock';

  switch (provider) {
    case 'neon': {
      const mod = await import('./db/pg');
      store = mod.pgStore;
      break;
    }
    case 'd1': {
      const mod = await import('./db/sqlite');
      store = mod.sqliteStore;
      break;
    }
    case 'mock':
    default:
      store = mockStore;
      break;
  }
  return store;
}

export const db = new Proxy<DataStore>({} as DataStore, {
  get(_target, prop: keyof DataStore) {
    return async (...args: unknown[]) => {
      const s = await getStore();
      const method = s[prop];
      if (typeof method === 'function') {
        return (method as (...args: unknown[]) => unknown).apply(s, args);
      }
      throw new Error(`Method ${String(prop)} is not a function`);
    };
  },
});
