// Minecraft スキン（Slim/Alex 型・64x64）から three.js のブロック人形を組み立てる。
// yume25d のスプライトテクスチャ（Tex25D.minecraftSkin）から参照され、GLTFモデルと同じく
// 「ホルダーGroupの原点＝足元」で挿入される。腕脚は肩/腰ピボットのGroupで包み、歩行スイングに使う。
import * as THREE from 'three';

export interface MinecraftSkinPreset { minecraftName: string; skinUrl: string; }
/** プリセットスキン（Slim型）。エディタの「マイクラスキン」からワンタップで追加できる。 */
export const MINECRAFT_SKIN_PRESETS: MinecraftSkinPreset[] = [
  { minecraftName: 'Momoi', skinUrl: 'https://s.namemc.com/i/8e561d74e6a87cf0.png' },
  { minecraftName: 'Midori', skinUrl: 'https://s.namemc.com/i/06e63aad7ea65219.png' },
  { minecraftName: 'Yuzu', skinUrl: 'https://s.namemc.com/i/bdecfd1ad2534e5c.png' },
  { minecraftName: 'Aris', skinUrl: 'https://s.namemc.com/i/e806697057c3f02b.png' },
];

export interface MinecraftLimbs {
  rArm: THREE.Object3D; lArm: THREE.Object3D; rLeg: THREE.Object3D; lLeg: THREE.Object3D;
}

const TEX_W = 64, TEX_H = 64;

/** BoxGeometry の1面のUVをスキン画像のpx矩形へ割り当てる。
 *  faceIdx: 0=+x 1=-x 2=+y(上) 3=-y(下) 4=+z(前) 5=-z(後)。
 *  BoxGeometry の面ごとの頂点順は [左上, 右上, 左下, 右下]（uvのv=1が画像の上端）。 */
const setFaceUV = (geo: THREE.BoxGeometry, faceIdx: number, x0: number, y0: number, w: number, h: number) => {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const u0 = x0 / TEX_W, u1 = (x0 + w) / TEX_W;
  const vT = 1 - y0 / TEX_H, vB = 1 - (y0 + h) / TEX_H;
  const o = faceIdx * 4;
  uv.setXY(o, u0, vT); uv.setXY(o + 1, u1, vT); uv.setXY(o + 2, u0, vB); uv.setXY(o + 3, u1, vB);
  uv.needsUpdate = true;
};

/** Minecraft標準のボックス展開（uvX,uvY=展開図の左上）から1パーツを作る。
 *  inflate はオーバーレイ層（帽子・ジャケット等）用のふくらみ（px）。 */
const makePart = (mat: THREE.Material, w: number, h: number, d: number, uvX: number, uvY: number, inflate = 0): THREE.Mesh => {
  const geo = new THREE.BoxGeometry(w + inflate, h + inflate, d + inflate);
  setFaceUV(geo, 0, uvX + d + w, uvY + d, d, h);      // +x（キャラの左側面）
  setFaceUV(geo, 1, uvX, uvY + d, d, h);              // -x（キャラの右側面）
  setFaceUV(geo, 2, uvX + d, uvY, w, d);              // 上
  setFaceUV(geo, 3, uvX + d + w, uvY, w, d);          // 下
  setFaceUV(geo, 4, uvX + d, uvY + d, w, h);          // +z（前）
  setFaceUV(geo, 5, uvX + 2 * d + w, uvY + d, w, h);  // -z（後ろ）
  return new THREE.Mesh(geo, mat);
};

/** スキンテクスチャから Slim 型プレイヤーモデルを組み立てる。
 *  worldHeight = モデルの身長（ワールド単位）。原点は足元・前方は +z（エンジンのモデル規約と同じ）。 */
export const buildMinecraftModel = (skin: THREE.Texture, worldHeight: number): { group: THREE.Group; limbs: MinecraftLimbs } => {
  // オーバーレイ層の透過px用に alphaTest。裏面も見える帽子ツバ等のため DoubleSide
  const mat = new THREE.MeshLambertMaterial({ map: skin, alphaTest: 0.25, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const add = (m: THREE.Mesh, x: number, y: number) => { m.position.set(x, y, 0); g.add(m); return m; };

  // 頭 8×8×8（24..32px）＋帽子オーバーレイ
  add(makePart(mat, 8, 8, 8, 0, 0), 0, 28);
  add(makePart(mat, 8, 8, 8, 32, 0, 0.9), 0, 28);
  // 胴 8×12×4（12..24px）＋ジャケット
  add(makePart(mat, 8, 12, 4, 16, 16), 0, 18);
  add(makePart(mat, 8, 12, 4, 16, 32, 0.5), 0, 18);

  // 腕（Slim=幅3）・脚：ピボットGroup（肩/腰）で包んで rotation.x スイングできるようにする
  const limb = (w: number, uvX: number, uvY: number, ovX: number, ovY: number, px: number, pivotY: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, pivotY, 0);
    const offY = pivotY === 22 ? -4 : -6;  // パーツ中心（腕18/脚6）− ピボット高
    const base = makePart(mat, w, 12, 4, uvX, uvY); base.position.y = offY; pivot.add(base);
    const ov = makePart(mat, w, 12, 4, ovX, ovY, 0.5); ov.position.y = offY; pivot.add(ov);
    g.add(pivot);
    return pivot;
  };
  const rArm = limb(3, 40, 16, 40, 32, -5.5, 22);  // 右腕（-x側）
  const lArm = limb(3, 32, 48, 48, 48, 5.5, 22);   // 左腕
  const rLeg = limb(4, 0, 16, 0, 32, -2, 12);      // 右脚
  const lLeg = limb(4, 16, 48, 0, 48, 2, 12);      // 左脚

  g.scale.setScalar(worldHeight / 32);  // 身長32px → worldHeight
  return { group: g, limbs: { rArm, lArm, rLeg, lLeg } };
};
