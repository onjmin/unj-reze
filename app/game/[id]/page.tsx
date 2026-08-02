import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { decodeId, encodeId } from '@/lib/sqids';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import GameLandingView from '@/components/GameLandingView';

// generateMetadata と本体で同じゲームを二重フェッチしないようリクエスト単位でメモ化する
const getCachedGame = cache(async (id: number) => db.getGame(id));

/** タイトル画面の背景がURLで保存されていればOGP画像に使う（内蔵アセット参照はサーバーで解決できない） */
function thumbnailOf(manifest: { titleScreen?: { bgRef?: string } } | undefined): string | undefined {
  const bgRef = manifest?.titleScreen?.bgRef;
  return typeof bgRef === 'string' && bgRef.startsWith('http') ? bgRef : undefined;
}

export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== 'true') return [];
  return [{ id: encodeId(1) }];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) return {};
  const game = await getCachedGame(decodedId);
  if (!game) return {};

  const title = game.title || 'ゲーム';
  const plays = game.plays ?? 0;
  const description = plays > 0
    ? `${plays}回あそばれています。登録なしでそのまま遊べます。`
    : 'ブラウザでそのまま遊べます。登録は要りません。';
  const url = `${SITE_URL}/game/${id}`;
  const image = thumbnailOf(game.manifest);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: 'article',
      locale: 'ja_JP',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeId(id);
  const game = decodedId === null ? null : await getCachedGame(decodedId);

  if (!game) {
    return (
      <div className="bg-[#0b0e14] text-gray-100 min-h-dvh flex flex-col items-center justify-center space-y-3">
        <p className="text-gray-500 text-sm">ゲームが見つかりません</p>
        <Link href="/" className="text-blue-400 text-xs hover:underline">戻る</Link>
      </div>
    );
  }

  const postId = await db.getPostIdByGameId(game.id);
  // 改造の可否は紐づくポストの権利表記で決まるので、ここだけは投稿本体も引く
  const post = postId ? await db.getPost(postId) : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    url: `${SITE_URL}/game/${id}`,
    datePublished: game.createdAt,
    gamePlatform: 'Web browser',
    applicationCategory: 'Game',
    ...(game.creatorSlug ? { author: { '@type': 'Person', name: game.creatorSlug } } : {}),
  };

  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-dvh w-full flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <GameLandingView
        gameId={encodeId(game.id)}
        title={game.title}
        manifest={game.manifest}
        preset={game.preset}
        creatorSlug={game.creatorSlug}
        plays={game.plays ?? 0}
        clears={game.clears ?? 0}
        bestScore={game.bestScore ?? 0}
        bestScoreBy={game.bestScoreBy}
        postId={postId ? encodeId(postId) : undefined}
        originType={post?.originType}
      />
    </div>
  );
}
