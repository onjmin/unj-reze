"use client";

import { useEffect } from "react";
import { assetPath } from "@/lib/site";

/**
 * Service Worker を登録して、ホーム画面に追加できる（インストール可能な）状態にする。
 * SW 自体はキャッシュを持たない素通し実装（public/sw.js）。
 */
export default function PwaRegister() {
	useEffect(() => {
		if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
			return;
		// 開発中は SW が HMR の邪魔になるので登録しない
		if (process.env.NODE_ENV !== "production") return;

		const onLoad = () => {
			navigator.serviceWorker
				.register(assetPath("/sw.js"), { scope: assetPath("/") })
				.catch(() => {});
		};

		if (document.readyState === "complete") onLoad();
		else window.addEventListener("load", onLoad);
		return () => window.removeEventListener("load", onLoad);
	}, []);

	return null;
}
