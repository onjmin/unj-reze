import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeId, encodeMv } from '@/lib/sqids';
import { withEdgeCache } from '@/lib/edge-cache';
import { resolveSessionUser } from '@/lib/auth/session-server';
import type { MvManifest } from '@/lib/mv-config';

function isMvManifest(m: unknown): m is MvManifest {
  if (!m || typeof m !== 'object') return false;
  const v = m as Partial<MvManifest>;
  return typeof v.mml === 'string'
    && !!v.stage
    && Array.isArray(v.layers)
    && Array.isArray(v.sections);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  // MVの中身は再編集されるまで変わらないので、エッジで長めに持たせてよい。
  // 誰が見ても同じ内容（パーソナライズなし）。
  return await withEdgeCache(request, { sMaxAge: 300, personalized: false }, async () => {
    const mv = await db.getMv(decodedId);
    if (!mv) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(encodeMv(mv));
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeId(id);
  if (decodedId === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const body = await request.json();
  const { title, manifest, sessionId } = body as { title?: string; manifest?: unknown; sessionId?: string };
  if (!title || !manifest) {
    return NextResponse.json({ error: 'title and manifest are required' }, { status: 400 });
  }
  if (!isMvManifest(manifest)) {
    return NextResponse.json({ error: 'invalid manifest' }, { status: 400 });
  }

  // 作者判定はセッション本人の slug で行う。body の userSlug を信じると
  // slug は公開情報なので、誰でも他人のMVを上書きできてしまう。
  const user = await resolveSessionUser(request, sessionId);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const mv = await db.getMv(decodedId);
  if (!mv) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!mv.creatorSlug || mv.creatorSlug !== user.slug) {
    return NextResponse.json({ error: 'Only the creator can edit this MV' }, { status: 403 });
  }

  const updated = await db.updateMv(decodedId, { title, manifest });
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(encodeMv(updated));
}
