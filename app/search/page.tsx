"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import SearchView from "@/components/SearchView";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

function SearchPageContent() {
	const currentUser = useCurrentUser();
	const searchParams = useSearchParams();
	const router = useRouter();

	return (
		<SearchView
			// 検索APIの userId は閲覧者identity（ブロック/ミュート絞り込み用）＝ users.id。
			// displayName を渡すと pg 側で整数化できずブロックが素通りする。
			userId={currentUser?.id}
			currentUserSlug={currentUser?.slug}
			currentUserDisplayName={currentUser?.displayName}
			initialQuery={searchParams.get("q") || undefined}
			onQuickPost={(text) =>
				router.push(
					`/?mention=${encodeURIComponent((text || "").replace(/^@/, ""))}`,
				)
			}
			openGame={() => {}}
			openCollab={() => {}}
			openMml={() => {}}
			// 検索ページは各種エディタを載せていないので編集導線は非対応
			onEditImage={null}
			onEditMml={null}
			onEditMv={null}
		/>
	);
}

export default function SearchPage() {
	return (
		<AppShell current="search">
			<div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
				<div className="flex items-center px-3 h-11">
					<Link
						href="/"
						className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors"
					>
						<ArrowLeft size={18} className="text-gray-300" />
					</Link>
				</div>
			</div>
			<div className="flex-1">
				<Suspense fallback={null}>
					<SearchPageContent />
				</Suspense>
			</div>
		</AppShell>
	);
}
