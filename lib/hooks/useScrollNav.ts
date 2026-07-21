'use client';

import { useCallback, useEffect, useState } from 'react';

/** アプリ本体のスクロールコンテナ（ページ側・AppShell 側で共通のid）。 */
export const SCROLL_CONTAINER_ID = 'scrollable-content';

/** 「スクロールした」と見なす移動量。指の震え程度では反応させない。 */
const DELTA_THRESHOLD = 8;
/** 上下端では常にフッターを出すための余白。 */
const EDGE_MARGIN = 12;

export function getScrollContainer(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(SCROLL_CONTAINER_ID);
}

/** スクロール状態を監視して
 *  - footerHidden: 下スクロール中はフッターを隠す（上スクロール／上下端で戻す。Twitter方式）
 *  - scrolled:     一定距離スクロールしたか（先頭/末尾ジャンプボタンの表示条件）
 *  を返す。
 *
 *  コンテナは画面切り替えで付け外しされるため、要素へ直接ではなく
 *  document のキャプチャ段階で scroll を拾う（scroll はバブルしないため capture が必要）。 */
export function useScrollNav(showJumpAfter = 400) {
  const [footerHidden, setFooterHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
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
        setFooterHidden(false);
        lastY = y;
      } else if (Math.abs(delta) > DELTA_THRESHOLD) {
        setFooterHidden(delta > 0);
        lastY = y;
      }
      setScrolled(y > showJumpAfter);
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
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [showJumpAfter]);

  const scrollToTop = useCallback(() => {
    getScrollContainer()?.scrollTo({ top: 0, behavior: 'smooth' });
    setFooterHidden(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = getScrollContainer();
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setFooterHidden(false);
  }, []);

  return { footerHidden, scrolled, scrollToTop, scrollToBottom };
}
