import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ProfileView from "@/components/ProfileView";
import VolumeControl from "@/components/VolumeControl";
import { db } from "@/lib/db";
import { db as mockDb } from "@/lib/mock-db";
import { SITE_URL } from "@/lib/site";

export function generateStaticParams() {
	if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true") return [];
	const slugs = new Set(mockDb.getPosts().map((p) => p.slug));
	const params = Array.from(slugs)
		.filter(Boolean)
		.map((slug) => ({ id: slug! }));
	return params.length > 0 ? params : [{ id: "demo" }];
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const rawParams = await params;
	const id = decodeURIComponent(rawParams.id || "");
	return {
		title: "プロフィール",
		alternates: { canonical: `${SITE_URL}/user/${encodeURIComponent(id)}` },
		openGraph: {
			title: "プロフィール",
			url: `${SITE_URL}/user/${encodeURIComponent(id)}`,
		},
	};
}

export default async function UserPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const rawParams = await params;
	const id = decodeURIComponent(rawParams.id || "");

	return (
		<AppShell current="profile">
			<div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
				<div className="flex items-center px-3 h-11">
					<Link
						href="/"
						className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors"
					>
						<ArrowLeft size={18} className="text-gray-300" />
					</Link>
					<span className="ml-3 font-bold text-sm text-gray-200">
						プロフィール
					</span>
					{/* 推しリストの試聴（Apple Musicプレビュー）にも掛かるマスター音量。
              ホームのヘッダーと同じ操作をこの画面だけで完結できるようにする。 */}
					<div className="ml-auto">
						<VolumeControl />
					</div>
				</div>
			</div>
			<div className="flex-1">
				<ProfileView userId={id} />
			</div>
		</AppShell>
	);
}
