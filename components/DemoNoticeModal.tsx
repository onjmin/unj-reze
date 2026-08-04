'use client';

import { useState } from 'react';

const PROD_URL = 'https://unj-reze.onjmin.workers.dev/';
const DISMISS_KEY = 'unj_demo_notice_dismissed';
const DISMISS_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// 一度閉じた人に毎回出すと、デモを触るたびに邪魔になるだけなので覚えておく
function shouldShowNotice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (!stored) return true;
    const dismissedAt = Number(stored);
    if (Number.isNaN(dismissedAt)) return true;
    return Date.now() - dismissedAt >= DISMISS_DURATION_MS;
  } catch {
    return true;
  }
}

export default function DemoNoticeModal() {
  const [visible, setVisible] = useState(shouldShowNotice);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-base font-bold text-white leading-snug">
            登録なしで、そのまま遊べます
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            ここは<span className="text-zinc-200 font-semibold">お試し版</span>。
            ゲームもお絵描きも全部さわれますが、投稿は保存されません。
          </p>
        </div>
        <button
          onClick={dismiss}
          className="block w-full text-center bg-blue-600 hover:bg-blue-500 transition-colors text-white font-semibold rounded-xl py-2.5 text-sm"
        >
          さっそく遊ぶ
        </button>
        <a
          href={PROD_URL}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors text-center"
          onClick={dismiss}
        >
          投稿を残したい人は本番サイトへ →
        </a>
      </div>
    </div>
  );
}
