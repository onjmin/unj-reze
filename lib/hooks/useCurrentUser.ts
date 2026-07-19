'use client';

import { useEffect, useState } from 'react';
import { AnonymousUser } from '@/lib/types';
import { api } from '@/lib/api';
import { ensureSessionId } from '@/lib/session';

export function useCurrentUser() {
  const [currentUser, setCurrentUser] = useState<AnonymousUser | null>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('unj_current_user');
      if (cached) setCurrentUser(JSON.parse(cached));
    } catch {}

    const sessionId = ensureSessionId();
    api.auth.anonymous(sessionId).then(user => {
      setCurrentUser(user);
      localStorage.setItem('unj_current_user', JSON.stringify(user));
    }).catch(() => {});
  }, []);

  return currentUser;
}
