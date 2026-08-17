"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { ensureSessionId } from "@/lib/session";
import { AnonymousUser } from "@/lib/types";

let cachedUserSnapshot: AnonymousUser | null = null;
const userListeners = new Set<() => void>();

function emitUserChange() {
	for (const listener of userListeners) {
		listener();
	}
}

function subscribeUser(listener: () => void) {
	userListeners.add(listener);
	return () => {
		userListeners.delete(listener);
	};
}

function getUserSnapshot(): AnonymousUser | null {
	if (cachedUserSnapshot) return cachedUserSnapshot;
	if (typeof window === "undefined" || typeof localStorage === "undefined")
		return null;
	try {
		const cached = localStorage.getItem("unj_current_user");
		if (cached) {
			cachedUserSnapshot = JSON.parse(cached);
			return cachedUserSnapshot;
		}
	} catch {}
	return null;
}

const SERVER_USER_SNAPSHOT = () => null;

export function useCurrentUser() {
	const user = useSyncExternalStore(
		subscribeUser,
		getUserSnapshot,
		SERVER_USER_SNAPSHOT,
	);

	useEffect(() => {
		const sessionId = ensureSessionId();
		api.auth
			.anonymous(sessionId)
			.then((freshUser) => {
				cachedUserSnapshot = freshUser;
				try {
					localStorage.setItem("unj_current_user", JSON.stringify(freshUser));
				} catch {}
				emitUserChange();
			})
			.catch(() => {});
	}, []);

	return user;
}
