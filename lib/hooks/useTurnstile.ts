'use client';

import { useCallback, useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const TOKEN_TIMEOUT_MS = 8000;

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('failed to load turnstile script'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

/**
 * Cloudflare Turnstile を invisible モードで運用するためのフック。
 * - トークンはウィジェット側で自動失効するため、重要操作の直前に必ず reset()+execute() し
 *   鮮度が保証された新しいトークンだけを使う（data-expired-callback でも明示的に破棄する）。
 * - NEXT_PUBLIC_TURNSTILE_SITE_KEY 未設定時は widget を描画せず getToken() は null を返す
 *   （サーバー側も TURNSTILE_SECRET_KEY 未設定時は検証をスキップするため、開発環境で機能する）。
 */
export function useTurnstile() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || !containerRef.current) return;

    let cancelled = false;

    loadTurnstileScript().then(() => {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        size: 'invisible',
        'expired-callback': () => {
          // 失効したトークンを使い回さないよう、次回 getToken() で確実に取り直す
          if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
        },
        'error-callback': () => {
          if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
        },
      });
      readyRef.current = true;
    }).catch(() => {
      readyRef.current = false;
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current) {
        try { window.turnstile?.remove(widgetIdRef.current); } catch {}
      }
    };
  }, []);

  /** 重要操作の直前に呼ぶ。毎回 reset→execute するため、返るトークンは常に鮮度が保証される。 */
  const getToken = useCallback((): Promise<string | null> => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || !readyRef.current || !widgetIdRef.current || !window.turnstile) {
      return Promise.resolve(null);
    }

    const widgetId = widgetIdRef.current;
    const turnstile = window.turnstile;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (token: string | null) => {
        if (settled) return;
        settled = true;
        resolve(token);
      };

      const timer = setTimeout(() => finish(null), TOKEN_TIMEOUT_MS);

      // render時の callback はここで一時的に差し替えられないため、
      // 都度 reset して execute のコールバック引数経由でトークンを受け取る。
      try {
        turnstile.reset(widgetId);
        turnstile.execute(widgetId);
      } catch {
        clearTimeout(timer);
        finish(null);
        return;
      }

      // execute() はグローバルコールバックを叩くため、render時に渡した callback を
      // 直接使わず、ポーリングで完了を検知する（Turnstile SDKはPromise APIを提供しないため）。
      const poll = setInterval(() => {
        const input = containerRef.current?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
        if (input?.value) {
          clearInterval(poll);
          clearTimeout(timer);
          finish(input.value);
        }
      }, 100);
    });
  }, []);

  return { containerRef, getToken };
}
