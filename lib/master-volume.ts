// 全体（MML投稿/YouTube埋め込み/ゲーム画面のBGM・SFX）に一律で掛かるマスター音量。
// 0-100、既定50。localStorageに永続化し、変更をpub/subで通知する。
// ミュート機能付き。ミュート時は実効音量が常に0になる。
const KEY = 'unj_master_volume';
const MUTE_KEY = 'unj_master_muted';
const DEFAULT_VOLUME = 50;

const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

let cached: number | null = null;
let mutedCache: boolean | null = null;
const volumeListeners = new Set<(v: number) => void>();
const muteListeners = new Set<(m: boolean) => void>();

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
  volumeListeners.forEach((cb) => cb(next));
}

export function getMuted(): boolean {
  if (mutedCache !== null) return mutedCache;
  if (typeof localStorage === 'undefined') return false;
  mutedCache = localStorage.getItem(MUTE_KEY) === '1';
  return mutedCache;
}

export function setMuted(m: boolean) {
  mutedCache = m;
  if (typeof localStorage !== 'undefined') localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  muteListeners.forEach((cb) => cb(m));
  // ミュート変更時も音量リスナーへ通知し、既存の購読者（BgmManager等）が
  // applyMasterVolume 経由で即座にミュート状態を反映できるようにする。
  volumeListeners.forEach((cb) => cb(getMasterVolume()));
}

export function subscribeMasterVolume(cb: (v: number) => void): () => void {
  volumeListeners.add(cb);
  return () => volumeListeners.delete(cb);
}

export function subscribeMuted(cb: (m: boolean) => void): () => void {
  muteListeners.add(cb);
  return () => muteListeners.delete(cb);
}

/** rawVolume(0-100) にマスター音量を掛け合わせた実効音量(0-100)を返す。ミュート時は0。 */
export function applyMasterVolume(rawVolume: number): number {
  if (getMuted()) return 0;
  return (rawVolume * getMasterVolume()) / 100;
}
