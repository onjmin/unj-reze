// mmo3d(three版)の初期モデルカタログ。ライセンスが明確に緩い(CC0/Apache-2.0)公開素材のみを
// 掲載する。ホストは jsDelivr 経由の Khronos 公式 glTF-Sample-Assets リポジトリ（アニメ付き
// モデルはスケルタルアニメ基盤(#3)の検証にそのまま使える）。
//
// 直リンクが失敗した場合は lib/cors-proxy.ts の wrapCorsProxyUrl() 経由で自動リトライされる
// （lib/yume25d.ts の loadModel() が既にこの方式）。
//
// MMD(PMX)素材は版元ごとに再配布条件が個別に定められていることが多く、確認なしに既定カタログ
// へ追加するのは避けている。babylon版(#7)の検証にはユーザーが用意したPMXファイルを使うこと。

export interface Mmo3dCatalogModel {
	id: string;
	label: string;
	/** glTF/GLB本体のURL。CORS対応済み（jsDelivrはAccess-Control-Allow-Origin: *を返す）。 */
	url: string;
	/** ライセンス表記（配布元の指定に従う）。 */
	license: string;
	/** アニメーションクリップを含むか（idle/walk等の検証に使えるか）。 */
	hasAnimations: boolean;
}

const GLTF_SAMPLES_BASE =
	"https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models";

export const MMO3D_BUILTIN_MODELS: Mmo3dCatalogModel[] = [
	{
		id: "cesium-man",
		label: "CesiumMan（歩行アニメ付き）",
		url: `${GLTF_SAMPLES_BASE}/CesiumMan/glTF-Binary/CesiumMan.glb`,
		license: "CC-BY 4.0 (Cesium / Analytical Graphics, Inc.)",
		hasAnimations: true,
	},
	{
		id: "fox",
		label: "Fox（走行/歩行/攻撃アニメ付き）",
		url: `${GLTF_SAMPLES_BASE}/Fox/glTF-Binary/Fox.glb`,
		license: "CC0 1.0 (PixelMannen, rigged by @tomkranis)",
		hasAnimations: true,
	},
	{
		id: "rigged-figure",
		label: "RiggedFigure（Tポーズ・ボーン確認用）",
		url: `${GLTF_SAMPLES_BASE}/RiggedFigure/glTF-Binary/RiggedFigure.glb`,
		license: "Apache 2.0 (Khronos Group)",
		hasAnimations: false,
	},
];
