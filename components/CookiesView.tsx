'use client';

export default function CookiesView() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 text-gray-200 text-sm font-sans leading-relaxed">
      <div className="border-b border-gray-800 pb-3">
        <h1 className="text-xl font-bold text-white tracking-tight">Cookie・ストレージについて</h1>
        <p className="text-xs text-gray-500 mt-1">更新日: 2026年7月20日</p>
      </div>

      <div className="space-y-4">
        <section className="space-y-1">
          <h2 className="font-bold text-white border-b border-gray-800/80 pb-1">1. 使用している目的</h2>
          <p className="text-gray-300">
            当サイトでは、ログイン状態（セッションID）や「掲示板モード / SNSモード」等の表示設定をブラウザに保存するためにCookieおよびWeb Storage（LocalStorage）を使用しています。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-bold text-white border-b border-gray-800/80 pb-1">2. データの消去</h2>
          <p className="text-gray-300">
            お使いのブラウザ設定からいつでも削除できますが、削除すると設定やセッションがリセットされます。
          </p>
        </section>
      </div>
    </div>
  );
}
