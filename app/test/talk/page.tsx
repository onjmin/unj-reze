"use client";

// かけあい動画の開発用ページ。見本台本（lib/talk-presets.ts）をそのまま再生し、「台本を編集」で TalkMaker を開く。

import dynamic from "next/dynamic";
import { useState } from "react";
import type { TalkManifest } from "@/lib/talk-config";
import { TALK_PRESETS } from "@/lib/talk-presets";

const TalkPlayer = dynamic(() => import("@/components/TalkPlayer"), { ssr: false });
const TalkMaker = dynamic(() => import("@/components/TalkMaker"), { ssr: false });

/** 見本の先頭（サイト紹介）をサンプルにする。見本自体は lib/talk-presets.ts。 */
const SAMPLE: TalkManifest = TALK_PRESETS[0].build();

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
