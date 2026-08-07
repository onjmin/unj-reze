"use client";

import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import MessageView from "@/components/MessageView";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

export default function MessagesPage() {
	const currentUser = useCurrentUser();

	return (
		<AppShell current="messages">
			<div className="sticky top-0 z-10 bg-[#0b0e14]/95 backdrop-blur border-b border-gray-800">
				<div className="flex items-center px-3 h-11 gap-1.5">
					<Link
						href="/"
						className="p-1.5 -ml-1.5 hover:bg-gray-100/10 rounded-full transition-colors"
					>
						<ArrowLeft size={18} className="text-gray-300" />
					</Link>
					<Mail size={15} className="text-[#a3e635]" />
					<span className="font-bold text-sm text-gray-200">メッセージ</span>
				</div>
			</div>
			<div className="flex-1">
				<MessageView userId={currentUser?.slug || currentUser?.displayName} />
			</div>
		</AppShell>
	);
}
