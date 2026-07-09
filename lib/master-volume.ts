// 全体（MML投稿/YouTube埋め込み/ゲーム画面のBGM・SFX）に一律で掛かるマスター音量。
// 0-100、既定50。localStorageに永続化し、変更をpub/subで通知する。
const KEY = 'unj_master_volume';
const DEFAULT_VOLUME = 50;

const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

let cached: number | null = null;
const listeners = new Set<(v: number) => void>();

export function getMasterVolume(): number {
  if (cached !== null) return cached;
  if (typeof localStorage === 'undefined') return DEFAULT_VOLUME;
  const raw = localStorage.getItem(KEY);
  const n = raw !== null ? Number(raw) : NaN;
  cached = Number.isFinite(n) ? clamp(n) : DEFAULT_VOLUME;
  return cached;
}

export function setMasterVolume(v: number) {
  const next = clamp(v);
  cached = next;
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, String(next));
  listeners.forEach((cb) => cb(next));
}

export function subscribeMasterVolume(cb: (v: number) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** rawVolume(0-100) にマスター音量を掛け合わせた実効音量(0-100)を返す。 */
export function applyMasterVolume(rawVolume: number): number {
  return (rawVolume * getMasterVolume()) / 100;
}
