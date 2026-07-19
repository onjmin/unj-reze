'use client';

import { useEffect, useState } from 'react';
import { AnonymousUser } from '@/lib/types';
import { api } from '@/lib/api';

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(`(?:^|;\\s*)${name}=([^;]*)`);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function useCurrentUser() {
  const [currentUser, setCurrentUser] = useState<AnonymousUser | null>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('unj_current_user');
      if (cached) setCurrentUser(JSON.parse(cached));
    } catch {}

    const sessionId = getCookie('unj_reze_session');
    if (sessionId) {
      api.auth.anonymous(sessionId).then(user => {
        setCurrentUser(user);
        localStorage.setItem('unj_current_user', JSON.stringify(user));
      }).catch(() => {});
    }
  }, []);

  return currentUser;
}
