import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeMv } from '@/lib/sqids';
import { MV_PRESET_LABELS, type MvManifest, type MvPresetKind } from '@/lib/mv-config';

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
  const { preset, title, manifest, creatorSlug } = body as {
    preset?: string; title?: string; manifest?: unknown; creatorSlug?: string;
  };

  if (!preset || !title || !manifest) {
    return NextResponse.json({ error: 'preset, title and manifest are required' }, { status: 400 });
  }
  if (!VALID_PRESETS.has(preset)) {
    return NextResponse.json({ error: 'unknown preset' }, { status: 400 });
  }
  if (!isMvManifest(manifest)) {
    return NextResponse.json({ error: 'invalid manifest' }, { status: 400 });
  }

  const mv = await db.createMv({
    preset: preset as MvPresetKind,
    title,
    manifest,
    creatorSlug,
  });
  return NextResponse.json(encodeMv(mv), { status: 201 });
}
