'use client';

import { useEffect, useState } from 'react';

const PROD_URL = 'https://unj-reze.netlify.app/';

export default function DemoNoticeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4">
        <p className="text-sm text-zinc-400 leading-relaxed">
          これは<span className="text-white font-semibold">デモ版</span>です。
          データは保存されず、一部機能が制限されています。
        </p>
        <a
          href={PROD_URL}
          className="block w-full text-center bg-blue-600 hover:bg-blue-500 transition-colors text-white font-semibold rounded-xl py-2.5 text-sm"
          onClick={dismiss}
        >
          本番サイトへ →
        </a>
        <button
          onClick={dismiss}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          このまま続ける
        </button>
      </div>
    </div>
  );
}
