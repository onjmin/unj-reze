'use client';

import Link from 'next/link';

export default function AboutView() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 text-gray-200 text-sm font-sans leading-relaxed">
      <div className="border-b border-gray-800 pb-3">
        <h1 className="text-xl font-bold text-white tracking-tight">サイトについて</h1>
        <p className="text-xs text-gray-500 mt-1">更新日: 2026年7月28日</p>
      </div>

      <p className="text-gray-300">
        オマージュの先に形づくられた表現と創作の遊び場を守り、静かに、細く長く存続させること。
      </p>

      <div className="space-y-4">
        <section className="space-y-1">
          <h2 className="font-bold text-white border-b border-gray-800/80 pb-1">横断型ゲームプラットフォームとしての側面</h2>
          <p className="text-gray-300">
            当掲示板は、イラスト・ドット絵・作曲等のコンテンツを投稿し、それらを素材として直接参照しながらシームレスにゲーム編集が行える場です。その間を取り持つインターフェースとしてTwitter風のSNS構造を採用しています。
          </p>
          <p className="text-gray-400 text-xs pt-0.5">
            既存の様々なサービスやツールの模倣を出発点としつつも、成行き的に獲得された「横断型ゲームプラットフォーム」としての側面をブレずに維持・運営していきます。
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-bold text-white border-b border-gray-800/80 pb-1">広告戦略および運用上の立ち位置</h2>
          <p className="text-gray-300">
            各種ツールや外部コンテンツ（YouTube等をBGMとして組み込む構成等）を取り扱う構造上、著作権的に微妙な性質を帯びています。外部掲示板へのスレ立て、Twitter等での外部宣伝、有料広告の打診といった各種プロモーションは一切行いません。ユーザー間の自然な口コミのみに依存し、基本的には「内内のコンテンツ」という立ち位置を保ちます。アクティブユーザー数は1人を想定しており、肥大化を追わず消極的かつ堅実な運用スタンスをとります。
          </p>
        </section>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <Link href="/settings" className="text-gray-400 hover:text-gray-300 hover:underline transition-colors text-xs">設定とプライバシー</Link>
      </div>
    </div>
  );
}