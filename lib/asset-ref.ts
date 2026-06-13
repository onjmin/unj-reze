// ゲームアセットの「参照」規約。実体(base64/バイナリ)は埋め込まず、短いURIで持つ。
// 詳細: docs/game-feature-design.md §3
//
//  画像/スプライト:
//    post:123            既存の画像投稿(id=123)の image_src を参照
//    walk:123#s0         既存の歩行グラ投稿を walk-cycle 規格で分割(方向s/フレーム0)
//    url:https://...     画像URL(直リンク or embed対応サイト)
//    tile:#2d5a27        単色タイル
//    emoji:🍄            絵文字スプライト
//  BGM/SE:
//    youtube:VIDEO_ID    (素のYouTube URLも可)
//    mml:post:123        既存MML投稿(id=123)を参照
//    mml:T120 cdefg      インラインMML
//    none / 空           なし

export interface ParsedRef {
  scheme: string;
  value: string;
  raw: string;
}

/** "scheme:rest" を分解。scheme が既知でなければ url とみなす。 */
export function parseRef(raw: string): ParsedRef | null {
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx === -1) return { scheme: 'url', value: raw, raw };
  const scheme = raw.slice(0, idx);
  const value = raw.slice(idx + 1);
  const known = ['post', 'walk', 'url', 'tile', 'emoji', 'youtube', 'mml', 'none'];
  if (!known.includes(scheme)) return { scheme: 'url', value: raw, raw };
  return { scheme, value, raw };
}

/** 画像参照を「いま表示に使えるURL」へ。post:/walk: は投稿の image_src 解決が要るため null を返す
 *  (エディタは ContentPicker が選択時に得た URL を別途キャッシュして使う)。 */
export function imageRefToUrl(raw: string): string | null {
  const ref = parseRef(raw);
  if (!ref) return null;
  switch (ref.scheme) {
    case 'url': return ref.value;
    case 'tile': return null;   // 単色: 描画側で色塗り
    case 'emoji': return null;  // 絵文字: 描画側でfillText
    case 'post':
    case 'walk': return null;   // 投稿解決が必要
    default: return null;
  }
}

export function isImageRef(raw: string): boolean {
  const ref = parseRef(raw);
  return !!ref && ['post', 'walk', 'url'].includes(ref.scheme);
}

/** BGM参照を BgmManager が解釈できる {type, src} へ。
 *  mml:post:N はその投稿のMML本文(rawMml)が要るため省略可。 */
export function bgmRefToAsset(
  raw: string,
  rawMml?: string,
): { type: 'youtube' | 'mml'; src: string } | null {
  const ref = parseRef(raw);
  if (!ref || ref.scheme === 'none' || !ref.value) return null;
  if (ref.scheme === 'youtube') return { type: 'youtube', src: ref.value };
  if (ref.scheme === 'url') return { type: 'youtube', src: ref.value };
  if (ref.scheme === 'mml') {
    if (ref.value.startsWith('post:')) {
      return rawMml ? { type: 'mml', src: rawMml } : null;
    }
    return { type: 'mml', src: ref.value };
  }
  return null;
}

/** 人間向けの短いラベル。 */
export function refLabel(raw: string): string {
  const ref = parseRef(raw);
  if (!ref || ref.scheme === 'none' || !ref.value) return 'なし';
  switch (ref.scheme) {
    case 'post': return `画像投稿 #${ref.value}`;
    case 'walk': return `歩行グラ #${ref.value.split('#')[0]}`;
    case 'url': return ref.value.length > 28 ? ref.value.slice(0, 26) + '…' : ref.value;
    case 'tile': return `色 ${ref.value}`;
    case 'emoji': return ref.value;
    case 'youtube': return 'YouTube BGM';
    case 'mml': return ref.value.startsWith('post:') ? `MML投稿 #${ref.value.slice(5)}` : 'MML';
    default: return ref.raw;
  }
}

export function youtubeRefFromUrl(url: string): string {
  const m = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? `youtube:${m[1]}` : `youtube:${url}`;
}
