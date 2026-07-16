// yume25d に配置できるサンプル3Dモデルのカタログ。
// three.js 公式サンプル（examples/models/gltf）と Khronos glTF-Sample-Assets の
// 単一ファイル glb だけを、CDN（jsDelivr の GitHub ミラー）から読み込む。
// Draco / KTX2 など追加デコーダが要るモデルは載せない（GLTFLoader 単体で読める物のみ）。

export interface ModelCatalogEntry {
  key: string;
  /** 一覧に出す日本語名 */
  label: string;
  /** パレット・2Dエディタで使う絵文字 */
  emoji: string;
  /** キーワード検索の対象（日本語・英語を空白区切りで） */
  tags: string;
  url: string;
  source: 'three.js' | 'Khronos';
}

// glTF-Sample-Assets は main ブランチ直参照（構成変更が稀なリポジトリ）。
// three.js はインストール中のバージョンに合わせたタグを固定して参照する。
const KHR = 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models';
const TJS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf';

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  { key: 'duck', label: 'アヒル', emoji: '🦆', tags: 'duck bird あひる とり 鳥 どうぶつ 動物', url: `${KHR}/Duck/glTF-Binary/Duck.glb`, source: 'Khronos' },
  { key: 'fox', label: 'キツネ', emoji: '🦊', tags: 'fox きつね 狐 どうぶつ 動物', url: `${KHR}/Fox/glTF-Binary/Fox.glb`, source: 'Khronos' },
  { key: 'horse', label: 'ウマ', emoji: '🐴', tags: 'horse うま 馬 どうぶつ 動物', url: `${TJS}/Horse.glb`, source: 'three.js' },
  { key: 'flamingo', label: 'フラミンゴ', emoji: '🦩', tags: 'flamingo bird ふらみんご とり 鳥', url: `${TJS}/Flamingo.glb`, source: 'three.js' },
  { key: 'parrot', label: 'オウム', emoji: '🦜', tags: 'parrot bird おうむ とり 鳥', url: `${TJS}/Parrot.glb`, source: 'three.js' },
  { key: 'stork', label: 'コウノトリ', emoji: '🕊️', tags: 'stork bird こうのとり とり 鳥', url: `${TJS}/Stork.glb`, source: 'three.js' },
  { key: 'fish', label: 'バラマンディ（魚）', emoji: '🐟', tags: 'fish barramundi さかな 魚', url: `${KHR}/BarramundiFish/glTF-Binary/BarramundiFish.glb`, source: 'Khronos' },
  { key: 'cesium-man', label: 'ヒト（CesiumMan）', emoji: '🧍', tags: 'man human ひと 人 人間', url: `${KHR}/CesiumMan/glTF-Binary/CesiumMan.glb`, source: 'Khronos' },
  { key: 'soldier', label: '兵士', emoji: '💂', tags: 'soldier human へいし 兵士 人', url: `${TJS}/Soldier.glb`, source: 'three.js' },
  { key: 'robot-expressive', label: 'ロボット', emoji: '🤖', tags: 'robot ろぼっと ロボット', url: `${TJS}/RobotExpressive.glb`, source: 'three.js' },
  { key: 'robot-brainstem', label: 'ロボット（BrainStem）', emoji: '🦾', tags: 'robot ろぼっと ロボット SF', url: `${KHR}/BrainStem/glTF-Binary/BrainStem.glb`, source: 'Khronos' },
  { key: 'milk-truck', label: 'ミルクトラック', emoji: '🚚', tags: 'truck car とらっく 車 くるま のりもの 乗り物', url: `${KHR}/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb`, source: 'Khronos' },
  { key: 'toy-car', label: 'おもちゃの車', emoji: '🚗', tags: 'toy car くるま 車 おもちゃ のりもの 乗り物', url: `${KHR}/ToyCar/glTF-Binary/ToyCar.glb`, source: 'Khronos' },
  { key: 'avocado', label: 'アボカド', emoji: '🥑', tags: 'avocado food あぼかど たべもの 食べ物 果物', url: `${KHR}/Avocado/glTF-Binary/Avocado.glb`, source: 'Khronos' },
  { key: 'water-bottle', label: '水筒', emoji: '🍶', tags: 'bottle water すいとう 水筒 ボトル', url: `${KHR}/WaterBottle/glTF-Binary/WaterBottle.glb`, source: 'Khronos' },
  { key: 'boombox', label: 'ラジカセ', emoji: '📻', tags: 'boombox radio らじかせ 音楽 ラジオ', url: `${KHR}/BoomBox/glTF-Binary/BoomBox.glb`, source: 'Khronos' },
  { key: 'lantern', label: '街灯ランタン', emoji: '🏮', tags: 'lantern light らんたん あかり 街灯', url: `${KHR}/Lantern/glTF-Binary/Lantern.glb`, source: 'Khronos' },
  { key: 'antique-camera', label: 'アンティークカメラ', emoji: '📷', tags: 'camera かめら カメラ', url: `${KHR}/AntiqueCamera/glTF-Binary/AntiqueCamera.glb`, source: 'Khronos' },
  { key: 'damaged-helmet', label: 'ダメージヘルメット', emoji: '🪖', tags: 'helmet SF へるめっと ヘルメット', url: `${KHR}/DamagedHelmet/glTF-Binary/DamagedHelmet.glb`, source: 'Khronos' },
  { key: 'sheen-chair', label: '椅子', emoji: '🪑', tags: 'chair いす 椅子 家具', url: `${KHR}/SheenChair/glTF-Binary/SheenChair.glb`, source: 'Khronos' },
  { key: 'corset', label: 'コルセット', emoji: '👗', tags: 'corset こるせっと 服 家具', url: `${KHR}/Corset/glTF-Binary/Corset.glb`, source: 'Khronos' },
  { key: 'box-textured', label: 'テクスチャ箱', emoji: '📦', tags: 'box はこ 箱', url: `${KHR}/BoxTextured/glTF-Binary/BoxTextured.glb`, source: 'Khronos' },
];

/** キーワード検索：空白区切りの全トークンが label/tags/key のどれかに含まれる物を返す。 */
export const searchModels = (query: string): ModelCatalogEntry[] => {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return MODEL_CATALOG;
  return MODEL_CATALOG.filter(m => {
    const hay = `${m.label} ${m.tags} ${m.key}`.toLowerCase();
    return tokens.every(t => hay.includes(t));
  });
};
