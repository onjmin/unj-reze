'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** アプリ本体のスクロールコンテナ（ページ側・AppShell 側で共通のid）。 */
export const SCROLL_CONTAINER_ID = 'scrollable-content';

/** 「スクロールした」と見なす移動量。指の震え程度では反応させない。 */
const DELTA_THRESHOLD = 8;
/** 上下端では常にフッターを出すための余白。 */
const EDGE_MARGIN = 12;
/** 先頭/末尾ジャンプボタンを出すスクロール量。 */
const SHOW_JUMP_AFTER = 400;

export function getScrollContainer(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(SCROLL_CONTAINER_ID);
}

type ScrollNavState = { footerHidden: boolean; scrolled: boolean };

// フッターとジャンプボタンで状態がズレないよう、購読者で1つの状態を共有する。
// （インスタンスごとに持つと「先頭へ」でフッターだけ隠れたまま、といった不整合が起きる）
let state: ScrollNavState = { footerHidden: false, scrolled: false };
const subscribers = new Set<() => void>();

function publish(next: Partial<ScrollNavState>) {
  const merged = { ...state, ...next };
  if (merged.footerHidden === state.footerHidden && merged.scrolled === state.scrolled) return;
  state = merged;
  subscribers.forEach(fn => fn());
}

let detach: (() => void) | null = null;

/** コンテナは画面切り替えで付け外しされるため、要素へ直接ではなく
 *  document のキャプチャ段階で scroll を拾う（scroll はバブルしないため capture が必要）。 */
function attach() {
  if (detach) return;
  let lastY = getScrollContainer()?.scrollTop ?? 0;
  let ticking = false;
  let pending: HTMLElement | null = null;

  const update = () => {
    ticking = false;
    const el = pending;
    if (!el) return;
    const y = el.scrollTop;
    const max = el.scrollHeight - el.clientHeight;
    const delta = y - lastY;

    if (y <= EDGE_MARGIN || max - y <= EDGE_MARGIN) {
      publish({ footerHidden: false });
      lastY = y;
    } else if (Math.abs(delta) > DELTA_THRESHOLD) {
      publish({ footerHidden: delta > 0 });
      lastY = y;
    }
    publish({ scrolled: y > SHOW_JUMP_AFTER });
  };

  // 非表示タブなど requestAnimationFrame が回らない環境でも取りこぼさないようにする
  const schedule = () => {
    if (ticking) return;
    ticking = true;
    if (typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(update);
    else setTimeout(update, 0);
  };

  const onScroll = (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (!target || target.id !== SCROLL_CONTAINER_ID) return;
    pending = target;
    schedule();
  };

  document.addEventListener('scroll', onScroll, true);
  detach = () => {
    document.removeEventListener('scroll', onScroll, true);
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
/** SSR時はスクロール前と同じ（フッター表示・ボタン非表示）で描画する。 */
const SERVER_STATE: ScrollNavState = { footerHidden: false, scrolled: false };
const getServerSnapshot = () => SERVER_STATE;

/** スクロール状態を返す。
 *  - footerHidden: 下スクロール中はフッターを隠す（上スクロール／上下端で戻す。Twitter方式）
 *  - scrolled:     一定距離スクロールしたか（先頭/末尾ジャンプボタンの表示条件） */
export function useScrollNav() {
  const local = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** 非表示タブではスムーススクロールが進まないため、その場合だけ即時移動にする。 */
  const scrollTo = useCallback((top: number) => {
    const el = getScrollContainer();
    if (!el) return;
    el.scrollTo({ top, behavior: document.hidden ? 'auto' : 'smooth' });
    publish({ footerHidden: false });
  }, []);

  const scrollToTop = useCallback(() => scrollTo(0), [scrollTo]);
  const scrollToBottom = useCallback(() => {
    scrollTo(getScrollContainer()?.scrollHeight ?? 0);
  }, [scrollTo]);

  return { footerHidden: local.footerHidden, scrolled: local.scrolled, scrollToTop, scrollToBottom };
}
