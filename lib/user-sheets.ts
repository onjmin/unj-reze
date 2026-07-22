'use client';

// ユーザー登録のスプライトシート（マイシート）。
//
// 内蔵シート（lib/local-assets.ts の LOCAL_TILE_SHEETS）と同じ「1枚の画像＋マス目サイズ」で
// 表し、選んだマスは `url:<url>#sx,sy,w,h` のクロップ参照になる。参照は絶対URLなので、
// 登録そのものはブラウザ（localStorage）に持たせても、置いた素材は他の人の画面でも表示される。
//
// 直リンクURLと、アップロードした画像（/api/upload 経由でURL化したもの）の両方を同じ形で扱う。

export interface UserSheet {
  id: string;
  name: string;
  url: string;
  /** 1マスの幅・高さ（px）。正方形でなくてよい（歩行グラの32x64など）。 */
  cellW: number;
  cellH: number;
  /** 登録日時（新しい順に並べるため）。 */
  createdAt: number;
  /** 単体素材（切り出した歩行グラ／スプライト）の確定参照。
   *  存在すればマス目で切り出すシートではなく「1体ぶんの完成素材」として扱い、
   *  選ぶときはこの参照（walk:...#x,y,w,h,frames,offsetY,scale や url:...#x,y,w,h）をそのまま使う。
   *  切り出し矩形・歩行規格・表示倍率はこの参照文字列にすべて内包される。 */
  pickRef?: string;
}

const KEY = 'unj_user_sheets';
const MAX_SHEETS = 30;

let cache: UserSheet[] | null = null;
const listeners = new Set<() => void>();

function read(): UserSheet[] {
  if (cache) return cache;
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    // 単体素材（pickRef あり）はマス目サイズを問わない。マス目シートは cellW/cellH が必須。
    cache = Array.isArray(arr) ? arr.filter(s => s && s.url && (s.pickRef || (s.cellW > 0 && s.cellH > 0))) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: UserSheet[]) {
  cache = next.slice(0, MAX_SHEETS);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // 容量超過などは黙って諦める（この場ではメモリ上のキャッシュだけ有効）
  }
  listeners.forEach(fn => fn());
}

export function getUserSheets(): UserSheet[] {
  return read();
}

export function addUserSheet(sheet: Omit<UserSheet, 'id' | 'createdAt'>): UserSheet {
  const created: UserSheet = {
    ...sheet,
    id: `us_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
  write([created, ...read()]);
  return created;
}

export function updateUserSheet(id: string, patch: Partial<Omit<UserSheet, 'id'>>): void {
  write(read().map(s => (s.id === id ? { ...s, ...patch } : s)));
}

export function removeUserSheet(id: string): void {
  write(read().filter(s => s.id !== id));
}

export function subscribeUserSheets(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** useSyncExternalStore 用のスナップショット（書き込み時だけ参照が変わる）。 */
export const userSheetsSnapshot = (): UserSheet[] => read();
const SERVER_SHEETS: UserSheet[] = [];
export const userSheetsServerSnapshot = (): UserSheet[] => SERVER_SHEETS;

// ── 個別シートの書き出し / 取り込み ──────────────────────────────────
// 別のゲームや別端末でも使い回せるよう、1シートを小さなJSONにして受け渡しする。
// 画像は絶対URLなので、この定義（名前・URL・マス目）さえあればどこでも復元できる。

const EXPORT_KIND = 'unj-user-sheet';
const EXPORT_VERSION = 1;

interface SheetExport {
  kind: typeof EXPORT_KIND;
  version: number;
  sheet: Pick<UserSheet, 'name' | 'url' | 'cellW' | 'cellH' | 'pickRef'>;
}

/** 1シートを配布用JSON文字列にする。 */
export function exportUserSheet(sheet: UserSheet): string {
  const payload: SheetExport = {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    sheet: { name: sheet.name, url: sheet.url, cellW: sheet.cellW, cellH: sheet.cellH, ...(sheet.pickRef ? { pickRef: sheet.pickRef } : {}) },
  };
  return JSON.stringify(payload, null, 2);
}

/** exportUserSheet が作ったJSONを取り込む。妥当なら登録して返す。不正なら null。 */
export function importUserSheet(json: string): UserSheet | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const obj = data as Partial<SheetExport>;
  if (!obj || obj.kind !== EXPORT_KIND) return null;
  const s = obj.sheet;
  if (!s || typeof s.url !== 'string' || !s.url.trim()) return null;
  const pickRef = typeof s.pickRef === 'string' && s.pickRef.trim() ? s.pickRef.trim() : undefined;
  const cellW = Number(s.cellW), cellH = Number(s.cellH);
  // 単体素材（pickRef）はマス目サイズを問わない。マス目シートは正の cellW/cellH が必須。
  if (!pickRef && (!(cellW > 0) || !(cellH > 0))) return null;
  return addUserSheet({
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : 'マイシート',
    url: s.url.trim(),
    cellW: cellW > 0 ? cellW : 16,
    cellH: cellH > 0 ? cellH : 16,
    ...(pickRef ? { pickRef } : {}),
  });
}

/** マス座標 → クロップ参照（内蔵シートの localTileUrl と同じ形式）。 */
export function userSheetCellRef(sheet: UserSheet, col: number, row: number): string {
  return `url:${sheet.url}#${col * sheet.cellW},${row * sheet.cellH},${sheet.cellW},${sheet.cellH}`;
}

/** クロップ参照から表示用URL（画像そのもの＋フラグメント）を作る。 */
export function userSheetCellUrl(sheet: UserSheet, col: number, row: number): string {
  return `${sheet.url}#${col * sheet.cellW},${row * sheet.cellH},${sheet.cellW},${sheet.cellH}`;
}
