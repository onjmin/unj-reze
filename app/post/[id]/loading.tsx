'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import PostDetail from '@/components/PostDetail';
import { Post } from '@/lib/types';

const BG = '#0b0e14';
const BORDER = '#1f2937';

export default function PostLoading() {
  const params = useParams();
  const id = params.id as string;
  const [post, setPost] = useState<Post | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`unj_post_${id}`);
      if (raw) {
        setPost(JSON.parse(raw));
        sessionStorage.removeItem(`unj_post_${id}`);
      }
    } catch {}
  }, [id]);

  const wrapperStyle: React.CSSProperties = { background: BG, color: '#e5e7eb', minHeight: '100dvh', width: '100%', display: 'flex', flexDirection: 'column' };
  const innerStyle: React.CSSProperties = { width: '100%', maxWidth: '42rem', marginLeft: 'auto', marginRight: 'auto', borderLeft: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, flex: 1, display: 'flex', flexDirection: 'column' };

  if (!post) {
    return (
      <div style={wrapperStyle}>
        <div style={innerStyle}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <style>{`@keyframes pl{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width: '1.5rem', height: '1.5rem', border: `2px solid ${BORDER}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'pl .6s linear infinite' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <div style={innerStyle}>
        <PostDetail post={post} />
      </div>
    </div>
  );
}
