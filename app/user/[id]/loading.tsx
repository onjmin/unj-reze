'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { readProfileSeed, type ProfileSeed } from '@/lib/profile-cache';
import { getAvatarInfo } from '@/lib/avatar';

const BG = '#0b0e14';
const BORDER = '#1f2937';

/** サーバー応答を待つあいだ、一覧側で判っている名前とアイコンだけ先に出す。
 *  投稿詳細の app/post/[id]/loading.tsx と同じ狙い。
 *  種が無ければ従来どおりスピナー。 */
export default function ProfileLoading() {
  const params = useParams();
  const raw = (params?.id as string) || '';
  const id = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
  const slug = id.match(/[a-zA-Z0-9]+$/)?.[0] || id;
  const [seed, setSeed] = useState<ProfileSeed | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => setSeed(readProfileSeed(slug) || readProfileSeed(id)));
  }, [slug, id]);

  const wrapperStyle: React.CSSProperties = { background: BG, color: '#e5e7eb', minHeight: '100dvh', width: '100%', display: 'flex', flexDirection: 'column' };
  const innerStyle: React.CSSProperties = { width: '100%', maxWidth: '42rem', marginLeft: 'auto', marginRight: 'auto', borderLeft: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, flex: 1, display: 'flex', flexDirection: 'column' };
  const spinner = (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
      <style>{`@keyframes pl{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: '1.5rem', height: '1.5rem', border: `2px solid ${BORDER}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'pl .6s linear infinite' }} />
    </div>
  );

  if (!seed) {
    return <div style={wrapperStyle}><div style={innerStyle}>{spinner}</div></div>;
  }

  const name = seed.displayName || slug;
  const info = getAvatarInfo(name);

  return (
    <div style={wrapperStyle}>
      <div style={innerStyle}>
        <div style={{ height: '2.75rem', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 0.75rem', fontSize: '0.875rem', fontWeight: 700, color: '#e5e7eb' }}>
          プロフィール
        </div>
        <div style={{ padding: '1rem', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '3.5rem', height: '3.5rem', borderRadius: '9999px', overflow: 'hidden', flexShrink: 0,
              border: '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...(seed.avatarUrl ? {} : info.style),
            }}
          >
            {seed.avatarUrl ? (
              <img src={seed.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <info.Icon style={{ width: '2rem', height: '2rem', color: 'rgba(255,255,255,0.4)' }} />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{info.username}</div>
            <div style={{ fontSize: '0.625rem', color: '#6b7280' }}>@{name}</div>
          </div>
        </div>
        {spinner}
      </div>
    </div>
  );
}
