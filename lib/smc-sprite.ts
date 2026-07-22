// SMC（Super Mario Construct）長方形スプライト専用ロジック。
//
// SMC のキャラ素材（プレイヤー＝パワーアップ姿のマリオ、敵）は、シート内のオフセット位置に置かれた
// 「正方形コマの横ストリップ」で歩行アニメを表す。コマ数・コマ寸法はキャラごとに異なる
// （敵＝16px・2〜3コマ、マリオ＝32px前後）。RPGen 等の歩行グラ規格（方向×フレームの格子）とは別物なので、
// SMC 参照（walk:smc）のときだけこのモジュールの slicing を使う。
//
//  参照形式（asset-ref.ts の parseWalkRef が解釈）:
//    walk:smc:u:<url>#sx,sy,sw,sh
//      (sx,sy,sw,sh) = シート内のストリップ矩形。右向き1行。
//
//  規約:
//   - コマは正方形。コマ寸法 = 矩形の高さ sh。
//   - コマ数 = round(sw / sh)（32→2コマ, 48→3コマ, 64→4コマ…）。マジックナンバー16には依存しない。
//   - 右向き素材のみ持ち、左移動は描画側で水平反転（flipH）。
//   - 停止時は先頭コマ（待機ポーズ）。
//   - マット背景の透明化は GameMaker のロード時クロマキーが担当（このモジュールは座標計算のみ）。

export type SmcCrop = [sx: number, sy: number, sw: number, sh: number];

export interface SmcFrameRect {
  sx: number; sy: number; sw: number; sh: number;
}

/**
 * ストリップ矩形からコマ数を求める。
 * 明示指定（非正方形コマの敵など）があればそれを、無ければ正方形コマ前提で 幅/高さ を採用。
 */
export function smcFrameCount(crop: SmcCrop, explicit?: number): number {
  if (explicit && explicit > 0) return Math.max(1, Math.round(explicit));
  const [, , sw, sh] = crop;
  if (sh <= 0) return 1;
  return Math.max(1, Math.round(sw / sh));
}

/**
 * 経過時間・移動状態から、いま描画すべき1コマのシート内矩形を返す。
 *  - moving=false: 先頭コマ（待機）。
 *  - moving=true : 経過時間 × fps で 0..frames-1 を循環。
 * コマ幅 = 矩形幅 / コマ数、コマ高 = 矩形高（正方形とは限らない）。
 * 向きは描画側で扱う（左移動は水平反転）。このモジュールは右向きストリップのコマ位置のみ算出する。
 */
export function smcFrameRect(
  crop: SmcCrop,
  opts: { moving: boolean; timeSec: number; fps?: number; frames?: number; row?: number },
): SmcFrameRect {
  const [sx, sy, sw, sh] = crop;
  const frames = smcFrameCount(crop, opts.frames);
  const frameW = sw / frames;
  const fps = opts.fps ?? 7;
  const idx = frames <= 1 || !opts.moving
    ? 0
    : ((Math.floor(opts.timeSec * fps) % frames) + frames) % frames;
  const rowOffsetY = (opts.row ?? 0) * sh;
  return { sx: sx + idx * frameW, sy: sy + rowOffsetY, sw: frameW, sh };
}
