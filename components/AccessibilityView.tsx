'use client';

export default function AccessibilityView() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 text-gray-200 text-sm font-sans leading-relaxed">
      <div className="border-b border-gray-800 pb-3">
        <h1 className="text-xl font-bold text-white tracking-tight">アクセシビリティ方針</h1>
        <p className="text-xs text-gray-500 mt-1">更新日: 2026年7月20日</p>
      </div>

      <div className="space-y-4">
        <section className="space-y-1">
          <h2 className="font-bold text-white border-b border-gray-800/80 pb-1">見やすさ・使いやすさへの配慮</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-300 pl-1">
            <li>画面が見やすいコントラスト設計（ダーク表示）</li>
            <li>スマホ・PCどちらでも崩れないレスポンシブ表示</li>
            <li>キーボード操作（Tab / Enter）への対応</li>
          </ul>
          <p className="text-gray-400 text-xs mt-2">
            今後も使いやすさの改善を続けていきます。
          </p>
        </section>
      </div>
    </div>
  );
}
