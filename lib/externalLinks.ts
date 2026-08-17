export interface ExternalLink {
	name: string;
	description: string;
	src: string;
}

export interface ExternalLinkGroup {
	title: string;
	links: ExternalLink[];
}

export const externalLinkGroups: ExternalLinkGroup[] = [
	{
		title: "さとる関連（おーぷん / おんJ本流）",
		links: [
			{
				name: "おんJ",
				description: "やきうはじめり",
				src: "https://hayabusa.open2ch.net/livejupiter/",
			},
			{
				name: "おーぷんwiki（仮）",
				description: "ここはおーぷん２ちゃんねるの事を色々と決めるWikiです。",
				src: "https://wiki.open2ch.net/Top",
			},
			{
				name: "おんJwiki（3代目）",
				description:
					"おんJwikiは おーぷん２ちゃんねる の なんでも実況J の用語や出来事を解説するwikiです。",
				src: "https://w.atwiki.jp/openj3/",
			},
			{
				name: "雑談たぬき",
				description: "v系以外の雑談はこちらで。。",
				src: "https://b.2ch2.net/zatsudan/i/",
			},
		],
	},
	{
		title: "kusa",
		links: [
			{
				name: "kusa本家",
				description: "毎日リセットされる匿名SNS",
				src: "https://kusa.open2ch.net/",
			},
			{
				name: "kusaWiki",
				description: "おーぷん２ちゃんねる kusaの歴史をまとめるWiki",
				src: "https://w.atwiki.jp/kusawiki/",
			},
			{
				name: "kusa鯖",
				description: "Minecraft Realms サーバー招待リンク",
				src: "https://realms.gg/UVm8QuFGQdYMWGY",
			},
			{
				name: "kusa避難所",
				description: "kusaの避難所SNS (wara)",
				src: "https://warasns.pages.dev/",
			},
			{
				name: "クサマチ",
				description:
					"今日の人生を、ひとつ。毎日ひとつ、その日だけのあなたが配られます。",
				src: "https://kusa-machi-production.up.railway.app/",
			},
		],
	},
	{
		title: "ボカロ制作スレ",
		links: [
			{
				name: "【公式】束音ロゼ",
				description: "安価でおんJ発のボカロキャラを作ろう",
				src: "https://tabaneroze.ninja-web.net/",
			},
			{
				name: "解音ゼロ OFFICIAL SITE TOP",
				description: "ゼロから生まれる無限の歌声",
				src: "https://zero-tokine-test.my.canva.site/",
			},
			{
				name: "革命シヨについて",
				description: "重音テトみたいなものが作りたいので安価で設定決める",
				src: "https://kakumeisiyo.1my.jp/",
			},
			{
				name: "春音リノ",
				description: "心に届く。美味しい歌声",
				src: "https://hatenakun1.github.io/halunelino/",
			},
		],
	},
	{
		title: "おんJ系掲示板（レンタル・避難所）",
		links: [
			{
				name: "おんJ@避難所",
				description: "おんJ@避難所",
				src: "https://jbbs.shitaraba.net/internet/21019/",
			},
			{
				name: "おーぷん2ちゃんねるの避難所",
				description: "ここは「誰もが使える」おーぷん2ちゃんねるの避難所です。",
				src: "https://jbbs.shitaraba.net/internet/21634/",
			},
			{
				name: "にんG",
				description: "にんにく実況(garlic)",
				src: "https://www.z-z.jp/?livegarlic",
			},
		],
	},
	{
		title: "おんJ系掲示板（個人開発・自作BBS）",
		links: [
			{
				name: "シン・2ちゃんねるなんJ",
				description: "みんなスレ立ててくれぇ",
				src: "https://version2.wuaze.com/livejupiter/",
			},
			{
				name: "おんjぴあの情報まとめ",
				description:
					"おんjぴあの情報まとめでは「おんjぴあの」の機能やツールについて解説しています。",
				src: "https://onjpiano-matome.vercel.app/",
			},
			{
				name: "Jeegle!",
				description: "おんjの検索サイト作った🥺",
				src: "https://wakawakatnt.github.io/Jeegle/",
			},
			{
				name: "かまぼこ掲示板",
				description: "かまぼこ掲示板",
				src: "https://kamaboko.kesug.com/",
			},
			{
				name: "なんL",
				description: "掲示板作ったからなんか書き込んでくれ",
				src: "https://openlive.pages.dev/",
			},
			{
				name: "なんI",
				description: "掲示板作ったんやが",
				src: "https://openlive2ch.pages.dev/",
			},
			{
				name: "ルナエクリプス",
				description: "多機能インターネット掲示板",
				src: "https://hei-bu-jing.onrender.com/",
			},
			{
				name: "gemini canvas、なんでも作れる",
				description: "掲示板も作れる模様",
				src: "https://gemini.google.com/share/3a74fb65e8c7",
			},
			{
				name: "29(肉)ちゃんねる",
				description:
					"「制限された自由」から「ある程度ある自由」までを手広くカバーする小規模匿名掲示板",
				src: "https://29-channel.iceiy.com/",
			},
			{
				name: "KomirkaBBS",
				description: "マイナンバー登録制の匿名掲示板",
				src: "https://www.komirkabbs.com/Threads/2025-06-01T16:50:51.271+09:00/2655c36a-00de-477b-ac1a-1aaa412cdfd9/1",
			},
			{
				name: "Hallo おんｊ",
				description: "おんj民でウェブサイト作るぞ",
				src: "https://onj-onj.vercel.app/",
			},
			{
				name: "WTAG",
				description: "90年代個人サイト風掲示板",
				src: "https://wtag.noob.jp/",
			},
			{
				name: "GABUNOMY",
				description: "意識低い系SNS",
				src: "https://lowawareness.com/",
			},
			{
				name: "チラウラリア",
				description: "カネルが作ったサイト",
				src: "https://tirauraria.me/",
			},
		],
	},
	{
		title: "まとめ・派生メディア",
		links: [
			{
				name: "なんJやきう関係ない部@おんJ",
				description:
					"野球に関係ないスレやアニメや漫画、カッスレ、打線組んだスレ、定期ネタなどが多いブログです。",
				src: "https://kankeinai.blog.jp/",
			},
			{
				name: "なんまめ",
				description: "主にうんこスレをまとめています。",
				src: "https://nanmame.livedoor.blog/",
			},
			{
				name: "さっぱりピーマン",
				description: "中身の無い2ch系まとめブログ",
				src: "https://sapparipiman.com/",
			},
			{
				name: "おんじぇいスタジアム＠おんJまとめ",
				description: "全員が執筆者や",
				src: "https://onjstu.livedoor.blog/",
			},
		],
	},
];
