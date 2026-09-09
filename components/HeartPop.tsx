"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { subscribeHeartPop } from "@/lib/toast";

interface Particle {
	id: string;
	x: number;
	y: number;
	angle: number;
	distance: number;
	delay: number;
	duration: number;
	size: number;
	color: string;
}

const COLORS = ["#f472b6", "#ec4899", "#fb7185", "#f43f5e"];
const PARTICLE_COUNT = 7;
const LIFETIME_MS = 700;

/** ハートボタンを自分でクリックした瞬間、その場からハートが弾け飛ぶ演出。
 * 投稿にハートが届いたときの画面全体降り注ぐ演出（HeartBurst）とは別物。 */
export default function HeartPop() {
	const [particles, setParticles] = useState<Particle[]>([]);

	useEffect(() => {
		return subscribeHeartPop((x, y) => {
			const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const next: Particle[] = Array.from(
				{ length: PARTICLE_COUNT },
				(_, i) => {
					const angle =
						(Math.PI * 2 * i) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.6;
					return {
						id: `${batchId}-${i}`,
						x,
						y,
						angle,
						distance: 26 + Math.random() * 22,
						delay: Math.random() * 60,
						duration: 500 + Math.random() * 250,
						size: 10 + Math.random() * 10,
						color: COLORS[Math.floor(Math.random() * COLORS.length)],
					};
				},
			);
			setParticles((prev) => [...prev, ...next]);
			setTimeout(() => {
				const ids = new Set(next.map((p) => p.id));
				setParticles((prev) => prev.filter((p) => !ids.has(p.id)));
			}, LIFETIME_MS);
		});
	}, []);

	if (particles.length === 0) return null;

	return (
		<div className="fixed inset-0 z-90 pointer-events-none overflow-hidden">
			{particles.map((p) => (
				<span
					key={p.id}
					className="absolute animate-heart-pop"
					style={{
						left: p.x,
						top: p.y,
						animationDelay: `${p.delay}ms`,
						animationDuration: `${p.duration}ms`,
						// @ts-expect-error custom properties consumed by the keyframe
						"--heart-pop-x": `${Math.cos(p.angle) * p.distance}px`,
						"--heart-pop-y": `${Math.sin(p.angle) * p.distance - 10}px`,
					}}
				>
					<Heart
						size={p.size}
						className="fill-current"
						style={{ color: p.color }}
					/>
				</span>
			))}
		</div>
	);
}
