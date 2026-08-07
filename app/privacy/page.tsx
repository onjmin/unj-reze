"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import PrivacyView from "@/components/PrivacyView";

export default function PrivacyPage() {
	return (
		<AppShell current="settings">
			<div className="sticky top-0 z-10 bg-[#0b0e14] border-b border-gray-800">
				<div className="flex items-center px-3 h-11">
					<Link
						href="/"
						className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors"
					>
						<ArrowLeft size={18} className="text-gray-300" />
					</Link>
					<span className="font-bold text-sm text-gray-200 ml-2">
						プライバシーポリシー
					</span>
				</div>
			</div>
			<div className="flex-1">
				<PrivacyView />
			</div>
		</AppShell>
	);
}
