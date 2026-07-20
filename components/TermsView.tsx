'use client';

export default function TermsView() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 text-gray-200 text-sm font-sans leading-relaxed">
      <div className="border-b border-gray-800 pb-3">
        <h1 className="text-xl font-bold text-white tracking-tight">利用規約</h1>
        <p className="text-xs text-gray-500 mt-1">更新日: 2026年7月20日</p>
      </div>

      <p className="text-gray-300">
        当掲示板（うんｊレゼ）を利用する際のお約束事です。利用を開始した時点で同意したものとみなします。
      </p>

      <div className="space-y-4">
        <section className="space-y-1">
          <h2 className="font-bold text-white border-b border-gray-800/80 pb-1">1. 投稿コンテンツと素材の二次利用</h2>
          <p className="text-gray-300">
            投稿された文章・ドット絵・音源・ゲームデータ等は、サイト内やゲーム素材として二次利用されることがあります。
          </p>
          <p className="text-gray-400 text-xs pt-0.5">
            ※「二次利用不可」等のラベル設定は可能ですが、技術的に二次利用を完全に防止・禁止する仕組みはありません。あらかじめご了承ください。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-bold text-white border-b border-gray-800/80 pb-1">2. 禁止事項</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-300 pl-1">
            <li>荒らし、過度な連投・スパム行為</li>
            <li>他者への過度な誹謗中傷・嫌がらせ</li>
            <li>違法コンテンツや公序良俗に反する投稿</li>
            <li>サーバーへの攻撃・不正アクセス</li>
          </ul>
        </section>

        <section className="space-y-1">
          <h2 className="font-bold text-white border-b border-gray-800/80 pb-1">3. 免責事項</h2>
          <p className="text-gray-300">
            当サイトの利用により生じたトラブルや損害について、管理人は一切の責任を負いません。データ消失やサービス停止が発生する場合もあります。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-bold text-white border-b border-gray-800/80 pb-1">4. EU/EEA地域からのアクセス制限</h2>
          <p className="text-gray-300">
            EU（欧州連合）等の厳格な法規制に対応するため、当サイトはEUおよびEEA（欧州経済領域）加盟国からのアクセスを制限・ブロックしています。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-bold text-white border-b border-gray-800/80 pb-1">5. 規約の変更</h2>
          <p className="text-gray-300">
            本規約は予告なく変更される場合があります。
          </p>
        </section>
      </div>
    </div>
  );
}
