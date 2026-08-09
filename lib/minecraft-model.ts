// Minecraft スキン（Slim/Alex 型・64x64）から three.js のブロック人形を組み立てる。
// yume25d のスプライトテクスチャ（Tex25D.minecraftSkin）から参照され、GLTFモデルと同じく
// 「ホルダーGroupの原点＝足元」で挿入される。腕脚は肩/腰ピボットのGroupで包み、歩行スイングに使う。
import * as THREE from "three";

export interface MinecraftSkinPreset {
	name: string;
	url: string;
	author?: string;
	authorUrl?: string;
}

const SETOMU_AUTHOR = "setomu@yuly";
const SETOMU_URL = "https://setomumcskin.ehoh.net/Koumakyou.html";

/** プリセットスキン（Slim型）。エディタの「マイクラスキン」からワンタップで追加できる。 */
export const MINECRAFT_SKIN_PRESETS: MinecraftSkinPreset[] = [
	{
		name: "正実モブ",
		url: "https://i.imgur.com/0BWVpea.png",
		author: "おんJ民（@onjmin_）さん / X",
		authorUrl: "https://x.com/onjmin_",
	},
	{
		name: "博麗 霊夢",
		url: "https://setomumcskin.ehoh.net/images/reimu.marisa/reimu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/reimumarisa.html",
	},
	{
		name: "博麗 霊夢 (青霊夢)",
		url: "https://setomumcskin.ehoh.net/images/reimu.marisa/aoreimu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/reimumarisa.html",
	},
	{
		name: "霧雨 魔理沙",
		url: "https://setomumcskin.ehoh.net/images/reimu.marisa/marisa_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/reimumarisa.html",
	},
	{
		name: "霧雨 魔理沙 (帽子なし)",
		url: "https://setomumcskin.ehoh.net/images/reimu.marisa/marisa.type2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/reimumarisa.html",
	},
	{
		name: "霧雨 魔理沙 (香霖堂)",
		url: "https://setomumcskin.ehoh.net/images/reimu.marisa/marisa.kourindou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/reimumarisa.html",
	},
	{
		name: "霧雨 魔理沙 (怪綺談)",
		url: "https://setomumcskin.ehoh.net/images/reimu.marisa/marisa.kaikidan_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/reimumarisa.html",
	},
	{
		name: "霧雨 魔理沙 (幻想郷)",
		url: "https://setomumcskin.ehoh.net/images/reimu.marisa/marisa.gensoukyou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/reimumarisa.html",
	},
	{
		name: "霧雨 魔理沙 (夢時空)",
		url: "https://setomumcskin.ehoh.net/images/reimu.marisa/marisa.mujiku_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/reimumarisa.html",
	},
	{
		name: "霧雨 魔理沙 (白魔理沙)",
		url: "https://setomumcskin.ehoh.net/images/reimu.marisa/siromarisa.mujiku_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/reimumarisa.html",
	},
	{
		name: "霧雨 魔理沙 (封魔録)",
		url: "https://setomumcskin.ehoh.net/images/reimu.marisa/marisa.humaroku_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/reimumarisa.html",
	},
	{
		name: "ルーミア",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/rumia_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "大妖精",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/daiyousei_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "チルノ",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/cirno_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "チルノ (ハイソ・ローファー)",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/cirno.type2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "紅 美鈴",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/Meiling_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "紅 美鈴 (ズボン)",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/Meiling.Type2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "小悪魔 ＆ ここぁ",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/koa_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "小悪魔 ＆ ここぁ (ここぁ)",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/kokoa_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "パチュリー・ノーレッジ",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/patchouli_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "パチュリー・ノーレッジ (2Pカラー)",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/patchouli.2Pcolor_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "十六夜 咲夜 (紅魔郷)",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/sakuya.Koumakyou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "十六夜 咲夜 (妖々夢)",
		url: "https://setomumcskin.ehoh.net/images/youyoumu/sakuya.youyoumu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "十六夜 咲夜 (永夜抄)",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/sakuya.eiya_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "十六夜 咲夜 (花映塚)",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/sakuya.kaeizuka_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "十六夜 咲夜 (輝針城)",
		url: "https://setomumcskin.ehoh.net/images/kishinjou/sakuya.kishinjou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "十六夜 咲夜 (ニーソ)",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/sakuya.niso_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "十六夜 咲夜 (耳としっぽ)",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/sakuya.wanwano_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "レミリア・スカーレット",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/remilia_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "レミリア・スカーレット (帽子なし)",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/remilia.zonbou.off_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "フランドール・スカーレット",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/flandre_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "フランドール・スカーレット (帽子なし)",
		url: "https://setomumcskin.ehoh.net/images/Koumakyou/flandre.zunbou.off_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/Koumakyou.html",
	},
	{
		name: "アリス・マーガトロイド",
		url: "https://setomumcskin.ehoh.net/images/youyoumu/alice_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "リリーホワイト",
		url: "https://setomumcskin.ehoh.net/images/youyoumu/Lilywhite_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "橙",
		url: "https://setomumcskin.ehoh.net/images/youyoumu/chen_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "八雲 藍",
		url: "https://setomumcskin.ehoh.net/images/youyoumu/ran_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "八雲 紫 (妖々夢)",
		url: "https://setomumcskin.ehoh.net/images/youyoumu/yukari.youyoumu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "八雲 紫 (永夜抄)",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/yukari.eiya_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "八雲 紫 (髪ｱｯﾌﾟ)",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/yukari.kamiUP_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "八雲 紫 (香霖堂)",
		url: "https://setomumcskin.ehoh.net/images/sonota/yukari.kourindou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "魂魄 妖夢 (半霊付き)",
		url: "https://setomumcskin.ehoh.net/images/youyoumu/youmu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "西行寺 幽々子 (妖々夢)",
		url: "https://setomumcskin.ehoh.net/images/youyoumu/yuyuko.youyoumu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "西行寺 幽々子 (永夜抄)",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/yuyuko.eiya_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "西行寺 幽々子 (神霊廟)",
		url: "https://setomumcskin.ehoh.net/images/shinreibyou/yuyuko.sinreibyou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/youyoumu.html",
	},
	{
		name: "リグル・ナイトバグ",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/wriggle_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "ミスティア・ローレライ",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/mystia_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "ミスティア・ローレライ (おかみすちー)",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/okamisutii_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "因幡 てゐ (永夜抄)",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/tei_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "因幡 てゐ (花映塚)",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/tei.kaeizuka_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "因幡 てゐ (黒てゐ)",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/tei.kuro_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "鈴仙・優曇華院・イナバ (永夜抄)",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/udonge.eiya_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "鈴仙・優曇華院・イナバ (花映塚)",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/udonge.kaeizuka_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "鈴仙・優曇華院・イナバ (緋想天)",
		url: "https://setomumcskin.ehoh.net/images/sonota/udonge.hisouten_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "鈴仙・優曇華院・イナバ (ニーソ)",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/udonge.niiso_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "八意 永琳",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/eirin_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "蓬莱山 輝夜",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/kaguya_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "上白沢 慧音",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/keine_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "上白沢 慧音 (ハクタク)",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/keine.hakutaku_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "藤原 妹紅",
		url: "https://setomumcskin.ehoh.net/images/eiyashou/mokou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/eiyashou.html",
	},
	{
		name: "風見 幽香",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/yuuka_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kaeizuka.html",
	},
	{
		name: "風見 幽香 (のうかりん)",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/noukarin_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kaeizuka.html",
	},
	{
		name: "風見 幽香 (ゆうかにゃん)",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/yuukanyan_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kaeizuka.html",
	},
	{
		name: "風見 幽香 (USC)",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/USC_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kaeizuka.html",
	},
	{
		name: "リリーブラック",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/Lilyblack_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kaeizuka.html",
	},
	{
		name: "小野塚 小町",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/komati_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kaeizuka.html",
	},
	{
		name: "四季映姫・ヤマザナドゥ",
		url: "https://setomumcskin.ehoh.net/images/kaeizuka/eiki_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kaeizuka.html",
	},
	{
		name: "秋 静葉",
		url: "https://setomumcskin.ehoh.net/images/hujinroku/sizuha_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hujinroku.html",
	},
	{
		name: "秋 穣子",
		url: "https://setomumcskin.ehoh.net/images/hujinroku/minoriko_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hujinroku.html",
	},
	{
		name: "鍵山 雛",
		url: "https://setomumcskin.ehoh.net/images/hujinroku/hina_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hujinroku.html",
	},
	{
		name: "河城 にとり",
		url: "https://setomumcskin.ehoh.net/images/hujinroku/nitori_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hujinroku.html",
	},
	{
		name: "犬走 椛",
		url: "https://setomumcskin.ehoh.net/images/hujinroku/momiji_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hujinroku.html",
	},
	{
		name: "射命丸 文 (羽毛付き)",
		url: "https://setomumcskin.ehoh.net/images/hujinroku/aya_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hujinroku.html",
	},
	{
		name: "東風谷 早苗",
		url: "https://setomumcskin.ehoh.net/images/hujinroku/sanae_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hujinroku.html",
	},
	{
		name: "八坂 神奈子",
		url: "https://setomumcskin.ehoh.net/images/hujinroku/kanako_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hujinroku.html",
	},
	{
		name: "洩矢 諏訪子",
		url: "https://setomumcskin.ehoh.net/images/hujinroku/suwako_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hujinroku.html",
	},
	{
		name: "黒谷 ヤマメ",
		url: "https://setomumcskin.ehoh.net/images/chireiden/yamame_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/chireiden.html",
	},
	{
		name: "水橋 パルスィ",
		url: "https://setomumcskin.ehoh.net/images/chireiden/parsee_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/chireiden.html",
	},
	{
		name: "星熊 勇儀",
		url: "https://setomumcskin.ehoh.net/images/chireiden/yugi_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/chireiden.html",
	},
	{
		name: "星熊 勇儀 (着物勇儀)",
		url: "https://setomumcskin.ehoh.net/images/chireiden/yugi.kimono_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/chireiden.html",
	},
	{
		name: "火焔猫 燐",
		url: "https://setomumcskin.ehoh.net/images/chireiden/rin_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/chireiden.html",
	},
	{
		name: "霊烏路 空",
		url: "https://setomumcskin.ehoh.net/images/chireiden/utuho_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/chireiden.html",
	},
	{
		name: "古明地 さとり (ジト目)",
		url: "https://setomumcskin.ehoh.net/images/chireiden/satori_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/chireiden.html",
	},
	{
		name: "古明地 こいし",
		url: "https://setomumcskin.ehoh.net/images/chireiden/koishi_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/chireiden.html",
	},
	{
		name: "多々良 小傘",
		url: "https://setomumcskin.ehoh.net/images/seirensen/kogasa_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/seirensen.html",
	},
	{
		name: "ナズーリン",
		url: "https://setomumcskin.ehoh.net/images/seirensen/nazrin_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/seirensen.html",
	},
	{
		name: "寅丸 星",
		url: "https://setomumcskin.ehoh.net/images/seirensen/syou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/seirensen.html",
	},
	{
		name: "聖 白蓮",
		url: "https://setomumcskin.ehoh.net/images/seirensen/byakuren_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/seirensen.html",
	},
	{
		name: "封獣 ぬえ",
		url: "https://setomumcskin.ehoh.net/images/seirensen/nue_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/seirensen.html",
	},
	{
		name: "幽谷 響子",
		url: "https://setomumcskin.ehoh.net/images/shinreibyou/Kyouko_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/shinreibyou.html",
	},
	{
		name: "幽谷 響子 (東方茨歌仙・冬服)",
		url: "https://setomumcskin.ehoh.net/images/sonota/kyouko.huyuhuku_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/shinreibyou.html",
	},
	{
		name: "宮古 芳香 (血色がいい)",
		url: "https://setomumcskin.ehoh.net/images/shinreibyou/yoshika_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/shinreibyou.html",
	},
	{
		name: "宮古 芳香 (血色がよくない)",
		url: "https://setomumcskin.ehoh.net/images/shinreibyou/yoshika.type2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/shinreibyou.html",
	},
	{
		name: "霍 青娥",
		url: "https://setomumcskin.ehoh.net/images/shinreibyou/seiga_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/shinreibyou.html",
	},
	{
		name: "蘇我 屠自古",
		url: "https://setomumcskin.ehoh.net/images/shinreibyou/tojiko_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/shinreibyou.html",
	},
	{
		name: "物部 布都",
		url: "https://setomumcskin.ehoh.net/images/shinreibyou/huto_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/shinreibyou.html",
	},
	{
		name: "豊聡耳 神子",
		url: "https://setomumcskin.ehoh.net/images/shinreibyou/miko_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/shinreibyou.html",
	},
	{
		name: "豊聡耳 神子 (心綺楼)",
		url: "https://setomumcskin.ehoh.net/images/sonota/miko.sinkirou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/shinreibyou.html",
	},
	{
		name: "二ッ岩 マミゾウ",
		url: "https://setomumcskin.ehoh.net/images/shinreibyou/mamizou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/shinreibyou.html",
	},
	{
		name: "わかさぎ姫",
		url: "https://setomumcskin.ehoh.net/images/kishinjou/wakasagihime_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kishinjou.html",
	},
	{
		name: "赤蛮奇",
		url: "https://setomumcskin.ehoh.net/images/kishinjou/sekibanki_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kishinjou.html",
	},
	{
		name: "今泉 影狼",
		url: "https://setomumcskin.ehoh.net/images/kishinjou/kagerou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kishinjou.html",
	},
	{
		name: "九十九 弁々",
		url: "https://setomumcskin.ehoh.net/images/kishinjou/benben_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kishinjou.html",
	},
	{
		name: "九十九 八橋",
		url: "https://setomumcskin.ehoh.net/images/kishinjou/yatsuhashi_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kishinjou.html",
	},
	{
		name: "鬼人 正邪",
		url: "https://setomumcskin.ehoh.net/images/kishinjou/seija_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kishinjou.html",
	},
	{
		name: "少名 針妙丸",
		url: "https://setomumcskin.ehoh.net/images/kishinjou/shinmyoumaru_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kishinjou.html",
	},
	{
		name: "堀川 雷鼓",
		url: "https://setomumcskin.ehoh.net/images/kishinjou/raiko_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/kishinjou.html",
	},
	{
		name: "宇佐見 蓮子 (蓮台野夜行)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/renko.rendainoyakou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "宇佐見 蓮子 (夢違科学世紀)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/renko.yumetagaekagakuseiki_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "宇佐見 蓮子 (卯酉東海道)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/renko.bouyutoukaidou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "宇佐見 蓮子 (大空魔術)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/renko.oozoramajutsu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "宇佐見 蓮子 (鳥船遺跡)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/renko.torihuneiseki_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "宇佐見 蓮子 (伊弉諾物質)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/renko.izanagibussitu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "マエリベリー・ハーン (蓮台野夜行)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/Merry.rendainoyakou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "マエリベリー・ハーン (夢違科学世紀)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/Merry.yumetagaekagakuseiki_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "マエリベリー・ハーン (卯酉東海道)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/Merry.bouyutoukaidou_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "マエリベリー・ハーン (大空魔術)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/Merry.oozoramajutsu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "マエリベリー・ハーン (鳥船遺跡)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/Merry.torihuneiseki_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "マエリベリー・ハーン (伊弉諾物質)",
		url: "https://setomumcskin.ehoh.net/images/hihuu/Merry.izanagibussitu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hihuu.html",
	},
	{
		name: "夢子(怪綺談)",
		url: "https://setomumcskin.ehoh.net/images/sonota/yumeko_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "姫海棠 はたて(ダブルスポイラー) (羽毛付き)",
		url: "https://setomumcskin.ehoh.net/images/sonota/hatate_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "Elis(靈異伝)",
		url: "https://setomumcskin.ehoh.net/images/sonota/Elis_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "伊吹 萃香(萃夢想)",
		url: "https://setomumcskin.ehoh.net/images/sonota/suika_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "伊吹 萃香(萃夢想) (酔ってる顔)",
		url: "https://setomumcskin.ehoh.net/images/sonota/suika.face2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "永江 衣玖(緋想天)",
		url: "https://setomumcskin.ehoh.net/images/sonota/iku_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "比那名居 天子(緋想天)",
		url: "https://setomumcskin.ehoh.net/images/sonota/tenshi_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "秦 こころ(心綺楼) (お面無し)",
		url: "https://setomumcskin.ehoh.net/images/sonota/kokoro_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "秦 こころ(心綺楼) (お面付き)",
		url: "https://setomumcskin.ehoh.net/images/sonota/kokoro.omen_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "ルナチャイルド(東方三月精)",
		url: "https://setomumcskin.ehoh.net/images/sonota/LunaChild_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "稗田 阿求(幺樂団の歴史・書籍など)",
		url: "https://setomumcskin.ehoh.net/images/sonota/akyuu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "本居 小鈴(鈴奈庵)",
		url: "https://setomumcskin.ehoh.net/images/sonota/kosuzu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "茨木 華扇(茨歌仙)",
		url: "https://setomumcskin.ehoh.net/images/sonota/kasen_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "茨木 華扇(茨歌仙) (冬服)",
		url: "https://setomumcskin.ehoh.net/images/sonota/kasen.type2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "モブ河童(茨歌仙)",
		url: "https://setomumcskin.ehoh.net/images/sonota/mobkappa_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "森近 霖之助(香霖堂)",
		url: "https://setomumcskin.ehoh.net/images/sonota/rinnosuke_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "瀬笈 葉(東方自然癒)",
		url: "https://setomumcskin.ehoh.net/images/sonota/seoiha_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "瀬笈 葉(Ex)",
		url: "https://setomumcskin.ehoh.net/images/sonota/seoiha.Ex_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/sonota.html",
	},
	{
		name: "ゆの",
		url: "https://setomumcskin.ehoh.net/images/hidamari/yuno_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hidamari.html",
	},
	{
		name: "宮子",
		url: "https://setomumcskin.ehoh.net/images/hidamari/miyako_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hidamari.html",
	},
	{
		name: "ヒロ",
		url: "https://setomumcskin.ehoh.net/images/hidamari/hirosan_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hidamari.html",
	},
	{
		name: "沙英",
		url: "https://setomumcskin.ehoh.net/images/hidamari/sae_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hidamari.html",
	},
	{
		name: "乃莉",
		url: "https://setomumcskin.ehoh.net/images/hidamari/nori_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hidamari.html",
	},
	{
		name: "なずな",
		url: "https://setomumcskin.ehoh.net/images/hidamari/nazuna_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/hidamari.html",
	},
	{
		name: "高坂 穂乃果",
		url: "https://setomumcskin.ehoh.net/images/lovelive/honoka_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "高坂 穂乃果 (練習着)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/honoka2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "南 ことり",
		url: "https://setomumcskin.ehoh.net/images/lovelive/kotori_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "南 ことり (練習着)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/kotori2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "園田 海未",
		url: "https://setomumcskin.ehoh.net/images/lovelive/umi_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "園田 海未 (練習着)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/umi2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "小泉 花陽",
		url: "https://setomumcskin.ehoh.net/images/lovelive/hanayo_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "小泉 花陽 (眼鏡)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/hanayo_type2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "小泉 花陽 (練習着)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/hanayo2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "星空 凛",
		url: "https://setomumcskin.ehoh.net/images/lovelive/rin_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "星空 凛 (練習着)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/rin2_2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "星空 凛 (練習着 スカート)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/rin2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "西木野 真姫",
		url: "https://setomumcskin.ehoh.net/images/lovelive/maki_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "西木野 真姫 (練習着)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/maki2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "矢澤 にこ",
		url: "https://setomumcskin.ehoh.net/images/lovelive/nico_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "矢澤 にこ (髪おろしにこにー)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/nico.type2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "矢澤 にこ (練習着)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/nico2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "絢瀬 絵里",
		url: "https://setomumcskin.ehoh.net/images/lovelive/eli_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "絢瀬 絵里 (練習着)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/eli2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "東條 希",
		url: "https://setomumcskin.ehoh.net/images/lovelive/nozomi_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "東條 希 (練習着)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/nozomi2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "綺羅 ツバサ",
		url: "https://setomumcskin.ehoh.net/images/lovelive/Tsubasa_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "綺羅 ツバサ (Shocking Party衣装)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/Tsubasa_s_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "統堂 英玲奈",
		url: "https://setomumcskin.ehoh.net/images/lovelive/Erena_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "統堂 英玲奈 (Shocking Party衣装)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/Erena_s_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "優木 あんじゅ",
		url: "https://setomumcskin.ehoh.net/images/lovelive/Anju_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "優木 あんじゅ (Shocking Party衣装)",
		url: "https://setomumcskin.ehoh.net/images/lovelive/Anjyu_s_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/lovelive.html",
	},
	{
		name: "モルジアナ（マギ） (足枷)",
		url: "https://setomumcskin.ehoh.net/images/hoka/Morgiana_a_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "モルジアナ（マギ）",
		url: "https://setomumcskin.ehoh.net/images/hoka/Morgiana_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "シオカラーズ（Splatoon） (アオリ)",
		url: "https://setomumcskin.ehoh.net/images/hoka/Aori_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "シオカラーズ（Splatoon） (アオリ　フェスカラー（ごはん）)",
		url: "https://setomumcskin.ehoh.net/images/hoka/Aori_F_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "シオカラーズ（Splatoon） (ホタル)",
		url: "https://setomumcskin.ehoh.net/images/hoka/Hotaru_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "シオカラーズ（Splatoon） (ホタル　フェスカラー（パン）)",
		url: "https://setomumcskin.ehoh.net/images/hoka/Hotaru_F_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "ドロンジョ／レパード（夜ノヤッターマン）",
		url: "https://setomumcskin.ehoh.net/images/hoka/doronjo_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "ドロンジョ／レパード（夜ノヤッターマン）",
		url: "https://setomumcskin.ehoh.net/images/hoka/leopard_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "ハルシュタイン（アイドルマスター／無尽合体キサラギ）",
		url: "https://setomumcskin.ehoh.net/images/hoka/harusyu_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "ハルシュタイン（アイドルマスター／無尽合体キサラギ） (マント着脱有り)",
		url: "https://setomumcskin.ehoh.net/images/hoka/harusyu2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "ヤヨイ（アイドルマスター／無尽合体キサラギ）",
		url: "https://setomumcskin.ehoh.net/images/hoka/yayoi.mujin_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "マコト（アイドルマスター／無尽合体キサラギ）",
		url: "https://setomumcskin.ehoh.net/images/hoka/makoto.mujin_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/otr.html",
	},
	{
		name: "しろくまパーカー",
		url: "https://setomumcskin.ehoh.net/images/original/sirokumasan_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/ori.html",
	},
	{
		name: "ピンクいろいろ",
		url: "https://setomumcskin.ehoh.net/images/original/ori1_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/ori.html",
	},
	{
		name: "耳あてもこもこ",
		url: "https://setomumcskin.ehoh.net/images/original/ori2_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/ori.html",
	},
	{
		name: "鍵盤スカート",
		url: "https://setomumcskin.ehoh.net/images/original/ori3_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/ori.html",
	},
	{
		name: "サスペンダー",
		url: "https://setomumcskin.ehoh.net/images/original/ori4_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/ori.html",
	},
	{
		name: "みずいろ",
		url: "https://setomumcskin.ehoh.net/images/original/ori5_Alex.png",
		author: "setomu@yuly",
		authorUrl: "https://setomumcskin.ehoh.net/ori.html",
	},
];

/** スキンURLから著作者情報を検索・判定する */
export const getMinecraftSkinAuthor = (
	url?: string,
): { author: string; authorUrl?: string } | null => {
	if (!url) return null;
	const preset = MINECRAFT_SKIN_PRESETS.find(
		(p) => p.url === url || (url.includes("0BWVpea") && p.name === "正実モブ"),
	);
	if (preset?.author) {
		return { author: preset.author, authorUrl: preset.authorUrl };
	}
	if (url.includes("setomumcskin.ehoh.net")) {
		return { author: SETOMU_AUTHOR, authorUrl: SETOMU_URL };
	}
	return null;
};

export interface MinecraftLimbs {
	rArm: THREE.Object3D;
	lArm: THREE.Object3D;
	rLeg: THREE.Object3D;
	lLeg: THREE.Object3D;
}

const TEX_W = 64,
	TEX_H = 64;

/** BoxGeometry の1面のUVをスキン画像のpx矩形へ割り当てる。
 *  faceIdx: 0=+x 1=-x 2=+y(上) 3=-y(下) 4=+z(前) 5=-z(後)。
 *  BoxGeometry の面ごとの頂点順は [左上, 右上, 左下, 右下]（uvのv=1が画像の上端）。 */
const setFaceUV = (
	geo: THREE.BoxGeometry,
	faceIdx: number,
	x0: number,
	y0: number,
	w: number,
	h: number,
) => {
	const uv = geo.attributes.uv as THREE.BufferAttribute;
	const u0 = x0 / TEX_W,
		u1 = (x0 + w) / TEX_W;
	const vT = 1 - y0 / TEX_H,
		vB = 1 - (y0 + h) / TEX_H;
	const o = faceIdx * 4;
	// Bottom face (-y): Minecraft skin bottom rect has front at bottom (high y), back at top (low y),
	// but BoxGeometry -y face maps +z (front) to vT. Swap vT/vB to correct.
	const bv = faceIdx === 3;
	uv.setXY(o, u0, bv ? vB : vT);
	uv.setXY(o + 1, u1, bv ? vB : vT);
	uv.setXY(o + 2, u0, bv ? vT : vB);
	uv.setXY(o + 3, u1, bv ? vT : vB);
	uv.needsUpdate = true;
};

/** Minecraft標準のボックス展開（uvX,uvY=展開図の左上）から1パーツを作る。
 *  inflate はオーバーレイ層（帽子・ジャケット等）用のふくらみ（px）。 */
const makePart = (
	mat: THREE.Material,
	w: number,
	h: number,
	d: number,
	uvX: number,
	uvY: number,
	inflate = 0,
): THREE.Mesh => {
	const geo = new THREE.BoxGeometry(w + inflate, h + inflate, d + inflate);
	setFaceUV(geo, 0, uvX + d + w, uvY + d, d, h); // +x（キャラの左側面）
	setFaceUV(geo, 1, uvX, uvY + d, d, h); // -x（キャラの右側面）
	setFaceUV(geo, 2, uvX + d, uvY, w, d); // 上
	setFaceUV(geo, 3, uvX + d + w, uvY, w, d); // 下
	setFaceUV(geo, 4, uvX + d, uvY + d, w, h); // +z（前）
	setFaceUV(geo, 5, uvX + 2 * d + w, uvY + d, w, h); // -z（後ろ）
	return new THREE.Mesh(geo, mat);
};

/** スキンテクスチャから Slim 型プレイヤーモデルを組み立てる。
 *  worldHeight = モデルの身長（ワールド単位）。原点は足元・前方は +z（エンジンのモデル規約と同じ）。 */
export const buildMinecraftModel = (
	skin: THREE.Texture,
	worldHeight: number,
): { group: THREE.Group; limbs: MinecraftLimbs } => {
	// オーバーレイ層の透過px用に alphaTest。裏面も見える帽子ツバ等のため DoubleSide
	const mat = new THREE.MeshLambertMaterial({
		map: skin,
		alphaTest: 0.25,
		side: THREE.DoubleSide,
	});
	const g = new THREE.Group();
	const add = (m: THREE.Mesh, x: number, y: number) => {
		m.position.set(x, y, 0);
		g.add(m);
		return m;
	};

	// 頭 8×8×8（24..32px）＋帽子オーバーレイ
	add(makePart(mat, 8, 8, 8, 0, 0), 0, 28);
	add(makePart(mat, 8, 8, 8, 32, 0, 0.9), 0, 28);
	// 胴 8×12×4（12..24px）＋ジャケット
	add(makePart(mat, 8, 12, 4, 16, 16), 0, 18);
	add(makePart(mat, 8, 12, 4, 16, 32, 0.5), 0, 18);

	// 腕（Slim=幅3）・脚：ピボットGroup（肩/腰）で包んで rotation.x スイングできるようにする
	const limb = (
		w: number,
		uvX: number,
		uvY: number,
		ovX: number,
		ovY: number,
		px: number,
		pivotY: number,
	) => {
		const pivot = new THREE.Group();
		pivot.position.set(px, pivotY, 0);
		const offY = pivotY === 22 ? -4 : -6; // パーツ中心（腕18/脚6）− ピボット高
		const base = makePart(mat, w, 12, 4, uvX, uvY);
		base.position.y = offY;
		pivot.add(base);
		const ov = makePart(mat, w, 12, 4, ovX, ovY, 0.5);
		ov.position.y = offY;
		pivot.add(ov);
		g.add(pivot);
		return pivot;
	};
	const rArm = limb(3, 40, 16, 40, 32, -5.5, 22); // 右腕（-x側）
	const lArm = limb(3, 32, 48, 48, 48, 5.5, 22); // 左腕
	const rLeg = limb(4, 0, 16, 0, 32, -2, 12); // 右脚
	const lLeg = limb(4, 16, 48, 0, 48, 2, 12); // 左脚

	g.scale.setScalar(worldHeight / 32); // 身長32px → worldHeight
	return { group: g, limbs: { rArm, lArm, rLeg, lLeg } };
};
