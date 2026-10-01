"use client";

// 音MAD の開発用ページ。見本（lib/otomad/otomad-presets.ts）をそのまま再生し、「編集」で OtomadMaker を開く。

import dynamic from "next/dynamic";
import { useState } from "react";
import type { OtomadManifest } from "@/lib/otomad/otomad-config";
import { OTOMAD_PRESETS } from "@/lib/otomad/otomad-presets";
import { parseMvSong } from "@/lib/mv/mv-engine";
import { buildOtomadTimeline } from "@/lib/otomad/otomad-timeline";

// 開発用: ブラウザのコンソールから解析を確かめる
if (typeof window !== "undefined") {
	(window as unknown as { __otomadDebug: unknown }).__otomadDebug = { parseMvSong, buildOtomadTimeline, OTOMAD_PRESETS };
}

const OtomadPlayer = dynamic(() => import("@/components/otomad/OtomadPlayer"), { ssr: false });
const OtomadMaker = dynamic(() => import("@/components/otomad/OtomadMaker"), { ssr: false });

const SAMPLE: OtomadManifest = OTOMAD_PRESETS[0].build();

export default function OtomadTestPage() {
	const [manifest, setManifest] = useState<OtomadManifest>(SAMPLE);
	const [revision, setRevision] = useState(0);
	const [editing, setEditing] = useState(false);

	return (
		<main className="min-h-screen bg-gray-950 text-gray-100 p-4">
			<h1 className="text-lg font-bold mb-3">音MAD（開発用）</h1>
			<div className="max-w-2xl">
				<OtomadPlayer key={revision} manifest={manifest} />
			</div>
			<div className="mt-3 flex items-center gap-3">
				<button
					type="button"
					onClick={() => setEditing(true)}
					className="rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:text-blue-300 px-3 py-1 text-[12px]"
				>
					編集
				</button>
				<p className="text-xs text-gray-400">タップで再生／一時停止。素材はローカルのまま使える。</p>
			</div>
			{editing && (
				<OtomadMaker
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
