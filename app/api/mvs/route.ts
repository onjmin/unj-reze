import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeMv } from '@/lib/sqids';
import { MV_PRESET_LABELS, type MvManifest, type MvPresetKind } from '@/lib/mv-config';
import { resolveSessionUser } from '@/lib/auth/session-server';
import { parseManifestRef, parseBgRef } from '@/lib/manifest-ref';

const VALID_PRESETS = new Set(Object.keys(MV_PRESET_LABELS));

/** manifest がMVとして最低限成立しているか。壊れたJSONを保存させない。 */
function isMvManifest(m: unknown): m is MvManifest {
  if (!m || typeof m !== 'object') return false;
  const v = m as Partial<MvManifest>;
  return typeof v.mml === 'string'
    && !!v.stage
    && Array.isArray(v.layers)
    && Array.isArray(v.sections);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { preset, title, manifest, sessionId } = body as {
    preset?: string; title?: string; manifest?: unknown; sessionId?: string;
  };

  if (!preset || !title) {
    return NextResponse.json({ error: 'preset and title are required' }, { status: 400 });
  }
  if (!VALID_PRESETS.has(preset)) {
    return NextResponse.json({ error: 'unknown preset' }, { status: 400 });
  }

  // manifest 本体はブラウザが uploader-worker へ直接上げ済みで、ここには届かない。
  // そのため isMvManifest による構造検証はサーバーでは行えなくなった。
  // 代わりに (1) uploader が JSON構文とサイズを検証し、(2) MvMaker が保存前に
  // isMvManifest を通し、(3) MvPlayer が壊れた manifest を握り潰す、の三段で守る。
  // ここで守れるのは「保存先が自分のR2かどうか」だけなので、そこは必ず見る。
  const manifestRef = parseManifestRef(body, 'mv');
  if (!manifestRef) {
    return NextResponse.json({ error: 'valid manifestUrl is required' }, { status: 400 });
  }

  // creatorSlug はセッション本人の slug を使う。body の creatorSlug は公開情報なので信用できない。
  const user = await resolveSessionUser(request, sessionId);
  const creatorSlug = user?.slug;

  const mv = await db.createMv({
    preset: preset as MvPresetKind,
    title,
    ...manifestRef,
    bgUrl: parseBgRef(body.bgUrl),
    creatorSlug,
  });
  return NextResponse.json(encodeMv(mv), { status: 201 });
}

