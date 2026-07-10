'use client';

import { useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { SM127_MUSIC, SM127_SFX, sm127MusicUrl, sm127SfxUrl, type SM127MusicKey, type SM127SfxKey } from '@/lib/mario-sm127-assets';
import { MEGAMAN_MUSIC, MEGAMAN_SFX, megamanMusicUrl, megamanSfxUrl, type MegamanMusicKey, type MegamanSfxKey } from '@/lib/megaman-assets';
import { UNDERTALE_ENGINE_SOUNDS, undertaleSfxUrl } from '@/lib/undertale-engine-sfx';
import { TLDR_MUSIC, TLDR_SFX, tldrMusicUrl, tldrSfxUrl, type TldrMusicKey, type TldrSfxKey } from '@/lib/deltarune-tldr-assets';
import type { PickResult } from './ContentPicker';

interface BuiltinGameSoundPanelProps {
  /** 'bgm'=BGM欄（ループ再生曲）、'sfx'=効果音欄（短い単発音） */
  kind: 'bgm' | 'sfx';
  onPick: (res: PickResult) => void;
}

type Source = 'undertale' | 'deltarune' | 'mario' | 'megaman';

interface Entry { key: string; label: string; url: string; }

const SOURCE_LABEL: Record<Source, string> = {
  undertale: '💀 アンダーテール',
  deltarune: '🖤 デルタルーン',
  mario: '🍄 マリオ127',
  megaman: '🔫 ロックマンJS',
};

// 各ゲームプロジェクトの音源一覧を { key, label, url } に正規化する。
// undertale は効果音のみ（BGM収録なし）、mario/megaman はBGM・SEどちらも持つ。
function buildEntries(source: Source, kind: 'bgm' | 'sfx'): Entry[] {
  if (source === 'undertale') {
    if (kind === 'bgm') return [];
    return UNDERTALE_ENGINE_SOUNDS.map(name => ({ key: name, label: name, url: undertaleSfxUrl(name) }));
  }
  if (source === 'deltarune') {
    if (kind === 'bgm') {
      return (Object.keys(TLDR_MUSIC) as TldrMusicKey[]).map(k => ({ key: k, label: k, url: tldrMusicUrl(k) }));
    }
    return (Object.keys(TLDR_SFX) as TldrSfxKey[]).map(k => ({ key: k, label: k, url: tldrSfxUrl(k) }));
  }
  if (source === 'mario') {
    if (kind === 'bgm') {
      return (Object.keys(SM127_MUSIC) as SM127MusicKey[]).map(k => ({ key: k, label: k, url: sm127MusicUrl(k) }));
    }
    return (Object.keys(SM127_SFX) as SM127SfxKey[]).map(k => ({ key: k, label: k, url: sm127SfxUrl(k) }));
  }
  // megaman
  if (kind === 'bgm') {
    return (Object.keys(MEGAMAN_MUSIC) as MegamanMusicKey[]).map(k => ({ key: k, label: k, url: megamanMusicUrl(k) }));
  }
  return (Object.keys(MEGAMAN_SFX) as MegamanSfxKey[]).map(k => ({ key: k, label: k, url: megamanSfxUrl(k) }));
}

const SOURCES: Source[] = ['undertale', 'deltarune', 'mario', 'megaman'];

/** 内蔵の他プロジェクト音源タブ（アンダーテール／デルタルーン／マリオ127／ロックマンJS）。
 *  いずれもGitHub raw CDNで直接配信されている音声を直リンク（type: 'direct'）として選択する。 */
export default function BuiltinGameSoundPanel({ kind, onPick }: BuiltinGameSoundPanelProps) {
  const sourcesAvailable = SOURCES.filter(s => buildEntries(s, kind).length > 0);
  const [source, setSource] = useState<Source>(sourcesAvailable[0] ?? 'mario');
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const entries = buildEntries(source, kind);

  const stopPreview = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPreviewKey(null);
  };

  const preview = (entry: Entry) => {
    if (previewKey === entry.key) { stopPreview(); return; }
    stopPreview();
    const a = new Audio(entry.url);
    a.volume = 0.6;
    a.play().catch(() => {});
    a.onended = () => setPreviewKey(k => (k === entry.key ? null : k));
    audioRef.current = a;
    setPreviewKey(entry.key);
  };

  const pick = (entry: Entry) => {
    onPick({ ref: `direct:${entry.url}`, url: entry.url, label: `${SOURCE_LABEL[source]} ${entry.label}` });
  };

  const secBtn = (active: boolean) =>
    `shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${active ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800'}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {sourcesAvailable.map(s => (
          <button key={s} className={secBtn(source === s)} onClick={() => { stopPreview(); setSource(s); }}>{SOURCE_LABEL[s]}</button>
        ))}
      </div>
      <p className="text-[10px] text-gray-600 px-0.5">
        他ゲームプロジェクトの{kind === 'bgm' ? 'BGM' : '効果音'}をGitHubから直接読み込みます（商用利用不可・出典クレジット推奨）。
      </p>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {entries.map(entry => {
          const isPrev = previewKey === entry.key;
          return (
            <div key={entry.key} className="flex items-center gap-1.5 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900">
              <button
                onClick={() => preview(entry)}
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isPrev ? 'bg-red-600/20 text-red-400' : 'bg-[#a3e635]/20 text-[#a3e635]'}`}
                title={isPrev ? '停止' : '試聴'}
              >
                {isPrev ? <Square size={11} /> : <Play size={11} className="ml-0.5" />}
              </button>
              <button onClick={() => pick(entry)} className="flex-1 min-w-0 text-left">
                <span className="text-[11px] text-gray-300 font-bold truncate block">{entry.label}</span>
              </button>
            </div>
          );
        })}
        {entries.length === 0 && <p className="text-center text-[11px] text-gray-600 py-8">音源がありません</p>}
      </div>
    </div>
  );
}
