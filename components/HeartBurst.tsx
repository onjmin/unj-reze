"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { subscribeHeartBurst } from "@/lib/toast";

interface Particle {
	id: string;
	left: number;
	delay: number;
	duration: number;
	drift: number;
	size: number;
	color: string;
}

const COLORS = ["#f472b6", "#ec4899", "#fb7185", "#f43f5e", "#e879f9"];
const PARTICLE_COUNT = 18;
const LIFETIME_MS = 1800;

export default function HeartBurst() {
	const [particles, setParticles] = useState<Particle[]>([]);

	useEffect(() => {
		return subscribeHeartBurst(() => {
			const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const next: Particle[] = Array.from(
				{ length: PARTICLE_COUNT },
				(_, i) => ({
					id: `${batchId}-${i}`,
					left: Math.random() * 100,
					delay: Math.random() * 300,
					duration: 1200 + Math.random() * 600,
					drift: (Math.random() - 0.5) * 160,
					size: 14 + Math.random() * 18,
					color: COLORS[Math.floor(Math.random() * COLORS.length)],
				}),
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
					className="absolute bottom-0 animate-heart-float"
					style={{
						left: `${p.left}%`,
						animationDelay: `${p.delay}ms`,
						animationDuration: `${p.duration}ms`,
						// @ts-expect-error custom property consumed by the keyframe
						"--heart-drift": `${p.drift}px`,
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
