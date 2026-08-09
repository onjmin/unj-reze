"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ensureSessionId } from "@/lib/session";
import { AnonymousUser } from "@/lib/types";

function getCachedUser(): AnonymousUser | null {
	if (typeof window === "undefined" || typeof localStorage === "undefined")
		return null;
	try {
		const cached = localStorage.getItem("unj_current_user");
		return cached ? JSON.parse(cached) : null;
	} catch {
		return null;
	}
}

export function useCurrentUser() {
	const [currentUser, setCurrentUser] = useState<AnonymousUser | null>(null);

	useEffect(() => {
		const cached = getCachedUser();
		if (cached) setCurrentUser(cached);

		const sessionId = ensureSessionId();
		api.auth
			.anonymous(sessionId)
			.then((user) => {
				setCurrentUser(user);
				try {
					localStorage.setItem("unj_current_user", JSON.stringify(user));
				} catch {}
			})
			.catch(() => {});
	}, []);

	return currentUser;
}
