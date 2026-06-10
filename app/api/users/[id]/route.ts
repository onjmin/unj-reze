import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const posts = db.getPosts().filter(p => p.name === id || p.name.includes('あなた'));

  return NextResponse.json({
    id,
    posts,
    postCount: posts.length,
  });
}
