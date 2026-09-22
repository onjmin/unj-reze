"use client";

// ボーカル（koe の UTAU 音源）のクレジット表示。
// 音源には配布元の利用規約があるので、声が鳴るところには必ず規約への導線を出す。
//
// 文言は読み手で変える（`variant`）。埋め込み（MvBox / TalkBox）は見る人が読むので
// 「この動画には◯◯の音源を使用しています」＝出典、エディタは作る人が読むので
// 「使用時には◯◯の利用規約に従ってください」＝義務の告知。@onjmin/dtm の MML プレイヤーと
// DAW も同じ切り分けになっている。対応表は lib/voice-credits.ts 経由で dtm から引く。

import { useEffect, useState } from "react";
import {
	collectMvVoiceCredits,
	collectTalkVoiceCredits,
	voiceCreditsOf,
	type VoiceCredit,
} from "@/lib/voice-credits";
import type { TalkManifest } from "@/lib/talk-config";

/**
 * 同じ顔ぶれなら前の配列を使い回す。エディタのプレビューは編集のたびに manifest が変わるので、
 * 中身が同じクレジットで再描画しない（音源を変えたときだけ差し替わる）。
 */
const keepIfSame = (prev: VoiceCredit[], next: VoiceCredit[]): VoiceCredit[] =>
	prev.length === next.length &&
	prev.every(
		(c, i) =>
			c.model === next[i].model &&
			c.label === next[i].label &&
			c.termsUrl === next[i].termsUrl,
	)
		? prev
		: next;

/** MV の MML から使用音源のクレジットを作る。 */
export function useMvVoiceCredits(mml: string | undefined): VoiceCredit[] {
	const [credits, setCredits] = useState<VoiceCredit[]>([]);
	useEffect(() => {
		let alive = true;
		void collectMvVoiceCredits(mml).then((c) => {
			if (alive) setCredits((prev) => keepIfSame(prev, c));
		});
		return () => {
			alive = false;
		};
	}, [mml]);
	return credits;
}

/** かけあい動画の登場人物から使用音源のクレジットを作る。 */
export function useTalkVoiceCredits(
	manifest: TalkManifest | null | undefined,
): VoiceCredit[] {
	const [credits, setCredits] = useState<VoiceCredit[]>([]);
	useEffect(() => {
		let alive = true;
		void collectTalkVoiceCredits(manifest).then((c) => {
			if (alive) setCredits((prev) => keepIfSame(prev, c));
		});
		return () => {
			alive = false;
		};
	}, [manifest]);
	return credits;
}

/**
 * 音源 1 つぶんのクレジット。エディタの音源プルダウンの下に出す用
 * （どの音源を選ぶとどの規約が付いてくるのかを、選ぶその場で見せる）。
 */
export function useVoiceCreditFor(
	model: string,
	customLabel?: string,
): VoiceCredit | null {
	const [credit, setCredit] = useState<VoiceCredit | null>(null);
	useEffect(() => {
		let alive = true;
		void voiceCreditsOf(
			[model],
			customLabel === undefined ? {} : { [model]: customLabel },
		).then((c) => {
			if (alive) setCredit(c[0] ?? null);
		});
		return () => {
			alive = false;
		};
	}, [model, customLabel]);
	return credit;
}

interface VoiceCreditsProps {
	credits: VoiceCredit[];
	/**
	 * 読み手が誰かで文言を変える。
	 * - `viewer`（既定・埋め込み）: 「この動画には◯◯の音源を使用しています」＝クレジット。
	 *   見る人は規約に縛られる立場ではないので、義務ではなく出典として読める形にする。
	 * - `creator`（エディタ）: 「使用時には◯◯の利用規約に従ってください」＝義務の告知。
	 *   dtm の MML プレイヤーと同じ文言。作る人はこれから規約に従う側なので。
	 */
	variant?: "viewer" | "creator";
	className?: string;
}

/** 音源名。規約 URL が分かっていればそのままリンクにする。 */
function VoiceName({ credit }: { credit: VoiceCredit }) {
	if (!credit.termsUrl) return <span className="text-gray-300">{credit.label}</span>;
	return (
		<a
			href={credit.termsUrl}
			target="_blank"
			rel="noopener noreferrer"
			title={`${credit.label}の利用規約`}
			className="text-cyan-400 underline hover:text-cyan-300"
			onClick={(e) => e.stopPropagation()}
		>
			{credit.label}
		</a>
	);
}

/** 作る人向けの 1 行（義務の告知）。 */
function CreatorRow({ credit }: { credit: VoiceCredit }) {
	if (credit.custom) {
		return (
			<div className="flex flex-wrap items-center gap-x-1">
				<span>使用時には持ち込み音源「{credit.label}」の配布元の規約に従ってください</span>
			</div>
		);
	}
	return (
		<div className="flex flex-wrap items-center gap-x-1">
			<span>使用時には</span>
			<span>
				<VoiceName credit={credit} />
				UTAU音源
			</span>
			<span>の利用規約に従ってください</span>
		</div>
	);
}

/**
 * 使用しているボーカル音源のクレジット。1件も無ければ何も描かない
 * （高さを持たないので、埋め込み側の高さ計算にも影響しない）。
 */
export default function VoiceCredits({
	credits,
	variant = "viewer",
	className,
}: VoiceCreditsProps) {
	if (credits.length === 0) return null;
	const box = `bg-gray-950/90 px-3 py-1.5 text-[10px] leading-tight text-amber-300/90 ${className ?? ""}`;

	if (variant === "creator") {
		return (
			<div className={`flex flex-col gap-0.5 ${box}`}>
				{credits.map((c) => (
					<CreatorRow key={c.model} credit={c} />
				))}
			</div>
		);
	}

	// 見る人向け: 音源名を並べて 1 文にする。名前をたどると配布元の利用規約へ行ける。
	const hasTerms = credits.some((c) => c.termsUrl);
	return (
		<div className={`flex flex-wrap items-center gap-x-1 ${box}`}>
			<span>この動画には</span>
			{credits.map((c, i) => (
				<span key={c.model}>
					{i > 0 && <span className="text-amber-300/60">・</span>}
					{c.custom ? (
						<span className="text-gray-300">持ち込み音源「{c.label}」</span>
					) : (
						<VoiceName credit={c} />
					)}
				</span>
			))}
			<span>の音源を使用しています</span>
			{hasTerms && (
				<span className="text-amber-300/60">（音源名から利用規約へ）</span>
			)}
		</div>
	);
}
