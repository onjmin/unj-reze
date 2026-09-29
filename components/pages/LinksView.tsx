"use client";

import { Link2 } from "lucide-react";
import LinksList from "./LinksList";

export default function LinksView() {
	return (
		<div>
			<div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800 px-4 py-3 font-bold text-sm text-gray-200 flex items-center gap-1.5">
				<Link2 size={15} className="text-blue-400" />
				リンク集
			</div>
			<LinksList />
		</div>
	);
}
