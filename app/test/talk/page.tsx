"use client";

// かけあい動画の開発用ページ（段階 1〜2: 固定 manifest の再生とエディタ）。
// 立ち絵は絵文字（emoji: 参照）で代用。投稿への紐づけと DB は次の段階。

import dynamic from "next/dynamic";
import { useState } from "react";
import { createDefaultTalkStage, type TalkManifest } from "@/lib/talk-config";

const TalkPlayer = dynamic(() => import("@/components/TalkPlayer"), { ssr: false });
const TalkMaker = dynamic(() => import("@/components/TalkMaker"), { ssr: false });

const SAMPLE: TalkManifest = {
	version: 1,
	title: "うんｊレゼって なに？",
	stage: createDefaultTalkStage(),
	characters: [
		{
			id: "boke",
			name: "ねこ",
			color: "#f9a8d4",
			side: "left",
			scale: 1,
			y: 0,
			faces: {
				neutral: { ref: "emoji:🐱" },
				happy: { ref: "emoji:😸" },
				sad: { ref: "emoji:😿" },
				angry: { ref: "emoji:😾" },
				surprised: { ref: "emoji:🙀" },
			},
			voice: { model: "tsukuyomi", style: "lively" },
		},
		{
			id: "tsukkomi",
			name: "いぬ",
			color: "#93c5fd",
			side: "right",
			scale: 1,
			y: 0,
			flipH: true,
			faces: {
				neutral: { ref: "emoji:🐶" },
				happy: { ref: "emoji:🐕" },
				angry: { ref: "emoji:🐺" },
			},
			voice: { model: "teto", pitchOffset: -2, style: "calm" },
		},
	],
	cues: [
		{ id: "c1", speaker: "boke", text: "ねえねえ、うんｊレゼって知ってる？", expression: "happy" },
		{ id: "c2", speaker: "tsukkomi", text: "知らん。なにそれ。" },
		{
			id: "c3",
			speaker: "boke",
			text: "ログインなしで使える、ゲームもつくれるエスエヌエスだよ。",
			expression: "happy",
		},
		{ id: "c4", speaker: "tsukkomi", text: "ログインなしって、だれが誰だか分からんやろ。", expression: "angry" },
		{ id: "c5", speaker: "boke", text: "それがいいんだって。名無しで気楽に投稿できるの。", expression: "surprised" },
		{ id: "c6", speaker: "tsukkomi", text: "なるほど。で、この動画もそこで作ったんか。" },
		{ id: "c7", speaker: "boke", text: "そう。台本を書いただけで、声も口パクも自動。", expression: "happy", gapSec: 0.6 },
		{ id: "c8", speaker: "tsukkomi", text: "便利やな。おわり。", expression: "happy" },
	],
};

export default function TalkTestPage() {
	const [manifest, setManifest] = useState<TalkManifest>(SAMPLE);
	const [revision, setRevision] = useState(0);
	const [editing, setEditing] = useState(false);

	return (
		<main className="min-h-screen bg-gray-950 text-gray-100 p-4">
			<h1 className="text-lg font-bold mb-3">かけあい動画（開発用）</h1>
			<div className="max-w-2xl">
				<TalkPlayer key={revision} manifest={manifest} />
			</div>
			<div className="mt-3 flex items-center gap-3">
				<button
					type="button"
					onClick={() => setEditing(true)}
					className="rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:text-blue-300 px-3 py-1 text-[12px]"
				>
					台本を編集
				</button>
				<p className="text-xs text-gray-400">タップで再生／一時停止。初回はボイスのデータ取得に時間がかかります。</p>
			</div>
			{editing && (
				<TalkMaker
					userId="dev"
					initialManifest={manifest}
					isEditing
					onClose={() => setEditing(false)}
					onSave={({ manifest: m }) => {
						setManifest(m);
						setRevision((r) => r + 1);
						setEditing(false);
					}}
				/>
			)}
		</main>
	);
}
