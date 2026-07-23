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

function isConnError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err);
  const causeMsg = err.cause ? String(err.cause.message || err.cause) : '';
  const code = err.code || err.cause?.code || err.sourceError?.code;
  return (
    code === 'ECONNREFUSED' ||
    msg.includes('fetch failed') ||
    msg.includes('Error connecting to database') ||
    msg.includes('ECONNREFUSED') ||
    causeMsg.includes('ECONNREFUSED')
  );
}

export const db = new Proxy<DataStore>({} as DataStore, {
  get(_target, prop: keyof DataStore) {
    return async (...args: unknown[]) => {
      const s = await getStore();
      const method = s[prop];
      if (typeof method === 'function') {
        try {
          return await (method as (...args: unknown[]) => unknown).apply(s, args);
        } catch (err: any) {
          const provider = process.env.DATABASE_PROVIDER || 'mock';
          if (provider !== 'mock' && isConnError(err)) {
            console.warn(`[db] Database connection failed (${provider}). Falling back to mockStore.`, err.message || err);
            const fallbackMethod = mockStore[prop];
            if (typeof fallbackMethod === 'function') {
              return (fallbackMethod as (...args: unknown[]) => unknown).apply(mockStore, args);
            }
          }
          throw err;
        }
      }
      throw new Error(`Method ${String(prop)} is not a function`);
    };
  },
});
