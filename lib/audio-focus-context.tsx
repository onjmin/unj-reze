'use client';

import { createContext, useContext, useRef, useCallback } from 'react';

interface AudioFocusEntry {
  id: string;
  onStop: () => void;
}

interface AudioFocusContextValue {
  requestFocus: (id: string, onStop: () => void) => void;
  releaseFocus: (id: string) => void;
}

const AudioFocusContext = createContext<AudioFocusContextValue | null>(null);

export function AudioFocusProvider({ children }: { children: React.ReactNode }) {
  const activeRef = useRef<AudioFocusEntry | null>(null);

  const requestFocus = useCallback((id: string, onStop: () => void) => {
    if (activeRef.current && activeRef.current.id !== id) {
      activeRef.current.onStop();
    }
    activeRef.current = { id, onStop };
  }, []);

  const releaseFocus = useCallback((id: string) => {
    if (activeRef.current?.id === id) {
      activeRef.current = null;
    }
  }, []);

  return (
    <AudioFocusContext.Provider value={{ requestFocus, releaseFocus }}>
      {children}
    </AudioFocusContext.Provider>
  );
}

export function useAudioFocus() {
  const ctx = useContext(AudioFocusContext);
  if (!ctx) throw new Error('useAudioFocus must be used within AudioFocusProvider');
  return ctx;
}
