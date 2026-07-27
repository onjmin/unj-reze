'use client';

import Link from 'next/link';

export default function AboutView() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 text-sm font-sans leading-relaxed">
      <div className="border-b border-gray-800 pb-3">
        <h1 className="text-xl font-bold tracking-tight">サイトについて</h1>
        <p className="text-xs text-gray-500 mt-1">更新日: 2026年7月28日</p>
      </div>

      <p>
        オマージュの先に形づくられた表現と創作の遊び場を守り、静かに、細く長く存続させること。
      </p>

      <div className="space-y-4">
        {/* 設立のきっかけ */}
        <section className="space-y-1">
          <h2 className="font-bold border-b border-gray-800/80 pb-1">設立のきっかけ</h2>
          <p>
            かつて矢野さとる氏が特定のおんJ民に対し「おんｊレゼ」というサイト領域を解放し、ドット絵制作ツールをはじめとする統合型内部ツールのようなゲーム作成領域を共有していました。当サイトは、そのゲーム作成の民主化という理念を継承・リスペクトし「うんｊレゼ」と名付けています。
          </p>
          <p className="text-xs text-gray-500 pt-0.5">
            内部ツールの詳細こそ不鮮明ですが、「矢野さとる氏なら内部的にここまで構築するだろう」という思想を模倣・拡張し、一般ユーザーへ開放することを目指して設立されました。
          </p>
        </section>

        {/* プラットフォームとしての側面 */}
        <section className="space-y-1">
          <h2 className="font-bold border-b border-gray-800/80 pb-1">横断型ゲームプラットフォームとしての側面</h2>
          <p>
            当サイトは、イラスト・ドット絵・作曲を投稿でき、それらを素材として直接参照しながらシームレスにゲーム編集が行える創作の場です。各機能をつなぐ基盤として、Twitter風のSNSインターフェースを模倣・採用しています。
          </p>
          <p className="text-xs text-gray-500 pt-0.5">
            矢野さとる氏の作品をはじめ、Twitter、RPGツクール、RPGEN等さまざまな先人の知見を模倣する中で、成り行き的に「素材とゲーム開発を横断的に結合するプラットフォーム」としての特徴を獲得するに至りました。この独自の側面をブレさせずに運営を続けていきます。
          </p>
        </section>

        {/* 広告戦略と運用方針 */}
        <section className="space-y-1">
          <h2 className="font-bold border-b border-gray-800/80 pb-1">広告戦略と運用上の立ち位置</h2>
          <p>
            当サイトは、ウディタやRPGENをはじめとする各種素材のオマージュや、YouTubeをBGMとして組み込めるゲーム投稿機構など、多様な外部要素を取り入れています。その構造上、著作権上の扱いが不可避的に繊細であり、本サイト「うんｊレゼ」自体も著作権的に不確定な要素を孕んでいます。
          </p>
          <p className="text-xs text-gray-500 pt-0.5">
            これは炎上リスクおよびサイトの存続リスクに直結するため、積極的な露出や話題化を行うべきではありません。おんJへのスレ立て、Twitter等での宣伝、有料広告の出稿といった外部プロモーションは一切行わず、ユーザー間の自然な口コミのみに依存する「基本内内のコンテンツ」として運用します。アクティブユーザー数1人を想定した、極めて消極的かつ静かな立場を維持していきます。
          </p>
        </section>
      </div>
    </div>
  );
}