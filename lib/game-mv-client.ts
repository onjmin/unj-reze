'use client';

import type { GameManifestDraft } from '@/components/GameMaker';
import type { MvManifest, MvPresetKind } from './mv-config';
import type { GameRecord, MvRecord } from './types';
import { uploadJson, fetchJson, deleteObject } from './uploader';

/**
 * ゲーム/MVの manifest はDBに入らない。ブラウザが uploader-worker へ直接上げ、
 * APIにはURLだけを渡す（docs/NEON_EGRESS.md）。
 *
 * 保存も読み出しもここを通す。直に fetch('/api/games') を書くと manifest を
 * そのままPOSTしてしまい、サーバー側で400になる。
 */

/** サムネ用の背景参照を manifest から抜く。DB側の bg_ref / bg_url に非正規化される */
function bgRefOf(manifest: GameManifestDraft): string | undefined {
  const ref = (manifest as { titleScreen?: { bgRef?: string } })?.titleScreen?.bgRef;
  return typeof ref === 'string' && ref.startsWith('http') ? ref : undefined;
}

function bgUrlOf(manifest: MvManifest): string | undefined {
  const url = (manifest as { stage?: { bgUrl?: string } })?.stage?.bgUrl;
  return typeof url === 'string' && url.startsWith('http') ? url : undefined;
}

export async function createGame(params: {
  preset: string;
  title: string;
  manifest: GameManifestDraft;
}): Promise<GameRecord> {
  const uploaded = await uploadJson('game', params.manifest);
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preset: params.preset,
      title: params.title,
      manifestUrl: uploaded.link,
      manifestDeleteId: uploaded.deleteId,
      manifestDeleteHash: uploaded.deleteHash,
      bgRef: bgRefOf(params.manifest),
    }),
  });
  if (!res.ok) throw new Error(`ゲームの保存に失敗しました: ${res.status}`);
  return res.json();
}

export async function createMv(params: {
  preset: MvPresetKind;
  title: string;
  manifest: MvManifest;
}): Promise<MvRecord> {
  const uploaded = await uploadJson('mv', params.manifest);
  const res = await fetch('/api/mvs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preset: params.preset,
      title: params.title,
      manifestUrl: uploaded.link,
      manifestDeleteId: uploaded.deleteId,
      manifestDeleteHash: uploaded.deleteHash,
      bgUrl: bgUrlOf(params.manifest),
    }),
  });
  if (!res.ok) throw new Error(`MVの保存に失敗しました: ${res.status}`);
  return res.json();
}

/**
 * 編集。R2は immutable で上書きできないので、毎回新しいキーへ上げ直す。
 * DBの更新が成功してから旧オブジェクトを消す。順序を逆にすると、更新に失敗した時点で
 * 作品が復旧不能になる（DBは旧URLを指したまま実体が無い状態）。
 */
export async function updateGame(
  gameId: string,
  params: { title: string; manifest: GameManifestDraft },
): Promise<GameRecord> {
  const uploaded = await uploadJson('game', params.manifest);
  const res = await fetch(`/api/games/${gameId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: params.title,
      manifestUrl: uploaded.link,
      manifestDeleteId: uploaded.deleteId,
      manifestDeleteHash: uploaded.deleteHash,
      bgRef: bgRefOf(params.manifest),
    }),
  });
  if (!res.ok) throw new Error(`ゲームの更新に失敗しました: ${res.status}`);
  const json = await res.json();
  await cleanupPrevious(json.previousManifest);
  return json;
}

export async function updateMv(
  mvId: string,
  params: { title: string; manifest: MvManifest },
): Promise<MvRecord> {
  const uploaded = await uploadJson('mv', params.manifest);
  const res = await fetch(`/api/mvs/${mvId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: params.title,
      manifestUrl: uploaded.link,
      manifestDeleteId: uploaded.deleteId,
      manifestDeleteHash: uploaded.deleteHash,
      bgUrl: bgUrlOf(params.manifest),
    }),
  });
  if (!res.ok) throw new Error(`MVの更新に失敗しました: ${res.status}`);
  const json = await res.json();
  await cleanupPrevious(json.previousManifest);
  return json;
}

/**
 * 旧オブジェクトの後始末。失敗しても投稿は成立しているので握り潰す
 * （残るのは孤児オブジェクト1個で、表示は壊れない）。
 */
async function cleanupPrevious(prev: { deleteId?: string; deleteHash?: string } | undefined) {
  if (!prev?.deleteId || !prev?.deleteHash) return;
  try {
    await deleteObject(prev.deleteId, prev.deleteHash);
  } catch (e) {
    console.warn('[uploader] 旧manifestの削除に失敗（孤児として残ります）', e);
  }
}

/** ゲーム1件を manifest 込みで取得する。manifest はR2から直接引く */
export async function loadGame(
  gameId: string,
): Promise<{ record: GameRecord; manifest: GameManifestDraft } | null> {
  const res = await fetch(`/api/games/${gameId}`);
  if (!res.ok) return null;
  const record: GameRecord = await res.json();
  if (!record.manifestUrl) return null;
  return { record, manifest: await fetchJson<GameManifestDraft>(record.manifestUrl) };
}

/** MV1件を manifest 込みで取得する */
export async function loadMv(
  mvId: string,
): Promise<{ record: MvRecord; manifest: MvManifest } | null> {
  const res = await fetch(`/api/mvs/${mvId}`);
  if (!res.ok) return null;
  const record: MvRecord = await res.json();
  if (!record.manifestUrl) return null;
  return { record, manifest: await fetchJson<MvManifest>(record.manifestUrl) };
}
