'use client';

import { useCallback, useSyncExternalStore } from 'react';

export const SCROLL_CONTAINER_ID = 'scrollable-content';

const DELTA_THRESHOLD = 8;
const EDGE_MARGIN = 12;
const SHOW_JUMP_AFTER = 400;
const REAPPEAR_DELAY = 800;

export function getScrollContainer(): HTMLElement | Element | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(SCROLL_CONTAINER_ID) || document.documentElement;
}

type ScrollNavState = { footerHidden: boolean; scrolled: boolean };

let state: ScrollNavState = { footerHidden: false, scrolled: false };
const subscribers = new Set<() => void>();

function publish(next: Partial<ScrollNavState>) {
  const merged = { ...state, ...next };
  if (merged.footerHidden === state.footerHidden && merged.scrolled === state.scrolled) return;
  state = merged;
  subscribers.forEach(fn => fn());
}

let detach: (() => void) | null = null;

function attach() {
  if (detach) return;

  // 初期位置の取得（特定コンテナ or window/document）
  const initialEl = getScrollContainer();
  let lastY = initialEl ? initialEl.scrollTop : (typeof window !== 'undefined' ? window.scrollY : 0);
  
  let ticking = false;
  let pendingTarget: EventTarget | null = null;
  let reappearTimer: ReturnType<typeof setTimeout> | null = null;

  const clearReappearTimer = () => {
    if (reappearTimer !== null) {
      clearTimeout(reappearTimer);
      reappearTimer = null;
    }
  };

  const update = () => {
    ticking = false;
    const target = pendingTarget;
    if (!target) return;

    let y = 0;
    let max = 0;

    // 1. 指定のスクロールコンテナ要素の場合
    if (target instanceof HTMLElement && target.id === SCROLL_CONTAINER_ID) {
      y = target.scrollTop;
      max = target.scrollHeight - target.clientHeight;
    } 
    // 2. document / window（全体スクロール）の場合
    else if (target === document || target === window || target === document.documentElement) {
      y = window.scrollY || document.documentElement.scrollTop;
      max = document.documentElement.scrollHeight - window.innerHeight;
    } 
    // それ以外のスクロールは対象外
    else {
      return;
    }

    const delta = y - lastY;

    if (y <= EDGE_MARGIN || max - y <= EDGE_MARGIN) {
      clearReappearTimer();
      publish({ footerHidden: false });
      lastY = y;
    } else if (Math.abs(delta) > DELTA_THRESHOLD) {
      if (delta > 0) {
        // 下スクロール中: フッターを非表示にする
        publish({ footerHidden: true });
        // スクロールが進行している間は自動表示タイマーをリセットし続ける
        // （スクロール操作が完全に停止してから REAPPEAR_DELAY 秒後にのみ復帰させる）
        clearReappearTimer();
        reappearTimer = setTimeout(() => {
          reappearTimer = null;
          publish({ footerHidden: false });
        }, REAPPEAR_DELAY);
      } else {
        // 上スクロール中: フッターを即座に表示
        clearReappearTimer();
        publish({ footerHidden: false });
      }
      lastY = y;
    }
    publish({ scrolled: y > SHOW_JUMP_AFTER });
  };

  const schedule = () => {
    if (ticking) return;
    ticking = true;
    if (typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(update);
    else setTimeout(update, 0);
  };

  const onScroll = (e: Event) => {
    const target = e.target;
    // 対象が document（全体スクロール）か、指定IDの要素の場合のみイベントを流す
    if (!target) return;
    if (target === document || (target instanceof HTMLElement && target.id === SCROLL_CONTAINER_ID)) {
      pendingTarget = target;
      schedule();
    }
  };

  document.addEventListener('scroll', onScroll, true);
  detach = () => {
    document.removeEventListener('scroll', onScroll, true);
    clearReappearTimer();
    detach = null;
  };
}

function subscribe(onChange: () => void) {
  attach();
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
    if (subscribers.size === 0) detach?.();
  };
}

const getSnapshot = () => state;
const SERVER_STATE: ScrollNavState = { footerHidden: false, scrolled: false };
const getServerSnapshot = () => SERVER_STATE;

export function useScrollNav() {
  const local = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const scrollTo = useCallback((top: number) => {
    window.scrollTo({ top, behavior: document.hidden ? 'auto' : 'smooth' });
    
    publish({ footerHidden: false });
  }, []);

  const scrollToTop = useCallback(() => scrollTo(0), [scrollTo]);
  const scrollToBottom = useCallback(() => {
    const el = getScrollContainer();
    const height = el ? el.scrollHeight : document.documentElement.scrollHeight;
    scrollTo(height);
  }, [scrollTo]);

  return { footerHidden: local.footerHidden, scrolled: local.scrolled, scrollToTop, scrollToBottom };
}