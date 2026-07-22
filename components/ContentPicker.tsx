'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Music, Video, Search, Loader2, Play, Square } from 'lucide-react';
import { api } from '@/lib/api';
import type { Post } from '@/lib/types';
import { extractMmlFromContent } from '@/lib/mml';
import { applyMasterVolume, subscribeMasterVolume } from '@/lib/master-volume';
import { youtubeRefFromUrl, toYoutubeWatchUrl, nicovideoRefFromUrl, soundcloudRefFromUrl } from '@/lib/asset-ref';
import RpgenAssetPanel from './RpgenAssetPanel';
import SpriteSheetBrowser from './SpriteSheetBrowser';
import SMCAssetPanel from './SMCAssetPanel';
import LocalAssetPanel from './LocalAssetPanel';
import UserSheetPanel from './UserSheetPanel';
import BuiltinGameSoundPanel from './BuiltinGameSoundPanel';
import AssetThumb from './AssetThumb';
import { getAvatarInfo } from '@/lib/avatar';

export interface PickResult {
  ref: string;
  url?: string;
  rawMml?: string;
  label: string;
}

interface ContentPickerProps {
  mode: 'image' | 'bgm';
  /** mode==='bgm' のときのみ有効。'bgm'=BGM欄（YouTube/MML/URL）、'sfx'=効果音欄（rpgen効果音/URL）でタブを出し分ける。 */
  bgmKind?: 'bgm' | 'sfx';
  userId: string;
  /** mode==='image' のときのみ有効。このゲーム内で現在使われている画像参照の一覧（履歴タブで再選択できる）。 */
  usedAssets?: { ref: string; url?: string; label: string }[];
  /** mode==='bgm' のときのみ有効。現在選択済みのBGM/効果音の参照。再編集時にタブとURL/MML欄へ復元する。 */
  currentRef?: string;
  onPick: (result: PickResult) => void;
  onClose: () => void;
}

type ImageTab = 'posts' | 'slice' | 'history' | 'walk' | 'url' | 'rpgenSprite' | 'rpgenWalk' | 'smc' | 'local' | 'mySheet';
type BgmTab = 'youtube' | 'nicovideo' | 'soundcloud' | 'mmlPost' | 'mmlRaw' | 'direct' | 'rpgenSe' | 'builtinGame';

// BGM欄と効果音欄で選べるタブを分ける。BGMはYouTube/MML/内蔵ゲーム音源/URL、効果音はrpgen効果音/内蔵ゲーム音源/URLのみ。
const BGM_TABS: BgmTab[] = ['youtube', 'nicovideo', 'soundcloud', 'mmlPost', 'builtinGame', 'mmlRaw', 'direct'];
const SFX_TABS: BgmTab[] = ['rpgenSe', 'builtinGame', 'direct'];

// モーダルは閉じるたびにアンマウントされるため、タブ選択とスクロール位置をモジュール変数で覚えておき、
// 再度開いたときに前回見ていた場所へ復元する。BGM欄/効果音欄は選べるタブが違うので別々に覚える。
// 画像タブから「投稿」「切り出し」「投稿グラ」は廃止（素材定義はマイシート＝素材定義パネルへ集約）。
// 廃止タブが最後の選択として復元されると空白になるため、既定のマイシートへ振り替える。
const REMOVED_IMAGE_TABS = new Set<string>(['posts', 'slice', 'walk', 'url']);
let lastImageTab: ImageTab = 'mySheet';
const lastBgmTabByKind: Record<'bgm' | 'sfx', BgmTab> = { bgm: 'youtube', sfx: 'rpgenSe' };
const scrollPositions = new Map<string, number>();


function formatTime(sec: number) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function ContentPicker({ mode, bgmKind = 'bgm', userId, usedAssets = [], currentRef, onPick, onClose }: ContentPickerProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // 旧「URL」タブは廃止し、画像URL/アップロードは「マイシート」に集約した。
  // 前回選択が 'url' のまま復元されると空白になるので mySheet へ振り替える。
  const [imageTab, setImageTab] = useState<ImageTab>(REMOVED_IMAGE_TABS.has(lastImageTab) ? 'mySheet' : lastImageTab);
  const allowedBgmTabs = bgmKind === 'sfx' ? SFX_TABS : BGM_TABS;
  // 現在選択中のBGM/効果音がある場合は、それが属するタブとURL/MML欄をあらかじめ復元する
  // （従来は毎回タブ・入力欄が空になり、既存の設定を再編集できなかった）。
  const currentRefBase = currentRef?.split('#')[0];
  const [bgmTab, setBgmTab] = useState<BgmTab>(() => {
    if (mode === 'bgm' && currentRefBase) {
      if (currentRefBase.startsWith('youtube:') && allowedBgmTabs.includes('youtube')) return 'youtube';
      if (currentRefBase.startsWith('nicovideo:') && allowedBgmTabs.includes('nicovideo')) return 'nicovideo';
      if (currentRefBase.startsWith('soundcloud:') && allowedBgmTabs.includes('soundcloud')) return 'soundcloud';
      if (currentRefBase.startsWith('direct:') && allowedBgmTabs.includes('direct')) return 'direct';
      if (currentRefBase.startsWith('mml:post:') && allowedBgmTabs.includes('mmlPost')) return 'mmlPost';
      if (currentRefBase.startsWith('mml:') && allowedBgmTabs.includes('mmlRaw')) return 'mmlRaw';
    }
    const last = lastBgmTabByKind[bgmKind];
    return allowedBgmTabs.includes(last) ? last : allowedBgmTabs[0];
  });
  const [urlInput, setUrlInput] = useState(() => {
    if (mode !== 'bgm' || !currentRefBase) return '';
    if (currentRefBase.startsWith('youtube:')) return toYoutubeWatchUrl(currentRefBase.replace(/^youtube:/, ''));
    if (currentRefBase.startsWith('direct:')) return currentRefBase.replace(/^direct:/, '');
    return '';
  });
  const [mmlInput, setMmlInput] = useState(() => {
    if (mode === 'bgm' && currentRefBase && currentRefBase.startsWith('mml:') && !currentRefBase.startsWith('mml:post:')) {
      return currentRefBase.replace(/^mml:/, '');
    }
    return 'T120 o4 c d e f g a b';
  });
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [mmlStepInfo, setMmlStepInfo] = useState<{ currentStep: number; totalSteps: number } | null>(null);
  const [directCurrentTime, setDirectCurrentTime] = useState(0);
  const [directDuration, setDirectDuration] = useState(0);
  const directAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopAllPreviewsRef = useRef<(() => void) | null>(null);
  const bgmRef = useRef<{ setVolume: (v: number) => void } | null>(null);
  const activeMmlCacheRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentTab = mode === 'image' ? imageTab : bgmTab;

  const stopAllPreviews = () => {
    stopAllPreviewsRef.current?.();
    stopAllPreviewsRef.current = null;
    if (directAudioRef.current) { directAudioRef.current.pause(); directAudioRef.current = null; }
    bgmRef.current = null;
    setPreviewKey(null);
    setMmlStepInfo(null);
    setDirectCurrentTime(0);
    setDirectDuration(0);
  };

  const handleSubpanelPlayPreview = (stopFn: () => void) => {
    stopAllPreviews();
    stopAllPreviewsRef.current = stopFn;
  };

  const changeImageTab = (tab: ImageTab) => { stopAllPreviews(); lastImageTab = tab; setImageTab(tab); };
  const changeBgmTab = (tab: BgmTab) => { stopAllPreviews(); lastBgmTabByKind[bgmKind] = tab; setBgmTab(tab); };

  // タブ切り替え時: 直前のタブのスクロール位置を保存し、切り替え先タブの位置を復元する
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = scrollPositions.get(`${mode}:${currentTab}`) ?? 0;
  }, [mode, currentTab]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    scrollPositions.set(`${mode}:${currentTab}`, el.scrollTop);
  };

  const previewMml = async (key: string, mml: string, seekStep?: number) => {
    const isSameKey = previewKey === key && seekStep === undefined;
    stopAllPreviews();
    if (isSameKey) return;
    if (!mml.trim()) return;
    try {
      const dtm = await import('@onjmin/dtm');
      const parsed = dtm.parseMML(mml);
      const totalSteps = parsed.placements?.length > 0
        ? Math.max(...parsed.placements.map((p: any) => p.startStep + p.durationSteps), 192)
        : 192;
      const bpm = parsed.bpm || 120;
      activeMmlCacheRef.current = { mml, parsed, totalSteps, bpm };

      const startAt = seekStep ?? 0;
      let bgm: any;

      if (startAt > 0 && dtm.playPlacements && parsed.placements) {
        const remaining = parsed.placements.filter((p: any) => p.startStep + p.durationSteps > startAt);
        const shifted = remaining.map((p: any) => ({ ...p, startStep: Math.max(0, p.startStep - startAt) }));
        bgm = dtm.playPlacements(shifted, {
          bpm,
          volume: applyMasterVolume(100),
          onTick: (relStep: number) => {
            setMmlStepInfo({ currentStep: Math.min(startAt + relStep, totalSteps), totalSteps });
          },
          onStop: () => {
            setPreviewKey(null);
            setMmlStepInfo(null);
            bgmRef.current = null;
          }
        });
      } else {
        bgm = dtm.playMML(mml, {
          loop: false,
          volume: applyMasterVolume(100),
          onTick: (step: number) => {
            setMmlStepInfo({ currentStep: Math.min(step, totalSteps), totalSteps });
          },
          onStop: () => {
            setPreviewKey(null);
            setMmlStepInfo(null);
            bgmRef.current = null;
          }
        });
      }

      bgmRef.current = bgm;
      stopAllPreviewsRef.current = () => {
        try { bgm.stop(); } catch (e) {}
        try { bgm.destroy(); } catch (e) {}
        setPreviewKey(null);
        setMmlStepInfo(null);
        bgmRef.current = null;
      };
      setPreviewKey(key);
      setMmlStepInfo({ currentStep: startAt, totalSteps });
    } catch (e) {
      console.error(e);
    }
  };

  const seekMml = (key: string, mml: string, targetStep: number) => {
    previewMml(key, mml, targetStep);
  };

  const toggleDirectAudioPreview = (url: string) => {
    if (previewKey === 'directUrl') {
      stopAllPreviews();
      return;
    }
    stopAllPreviews();
    const a = new Audio(url);
    a.volume = (applyMasterVolume(100) / 100) * 0.7;
    a.ontimeupdate = () => setDirectCurrentTime(a.currentTime);
    a.onloadedmetadata = () => setDirectDuration(a.duration);
    a.onended = () => {
      setPreviewKey(null);
      setDirectCurrentTime(0);
    };
    a.play().catch(() => {});
    directAudioRef.current = a;
    stopAllPreviewsRef.current = () => {
      a.pause();
      directAudioRef.current = null;
      setPreviewKey(null);
      setDirectCurrentTime(0);
      setDirectDuration(0);
    };
    setPreviewKey('directUrl');
    setDirectCurrentTime(0);
    setDirectDuration(0);
  };

  useEffect(() => () => { stopAllPreviews(); }, []);

  useEffect(() => subscribeMasterVolume(() => bgmRef.current?.setVolume(applyMasterVolume(100))), []);

  useEffect(() => {
    let alive = true;
    api.posts.list(userId)
      .then(data => { if (alive) setPosts(data); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId]);

  const q = query.trim().toLowerCase();
  // BGM欄の「MML投稿」タブ用。画像投稿の直接ピックは廃止（マイシート＝素材定義パネルへ集約）。
  const mmlPosts = posts.filter(p => {
    const mml = extractMmlFromContent(p.content);
    return !!mml && (!q || p.content.toLowerCase().includes(q));
  });

  const pickYoutube = () => {
    const v = urlInput.trim();
    if (!v) return;
    onPick({ ref: youtubeRefFromUrl(v), url: v, label: 'YouTube BGM' });
  };

  const pickNicovideo = () => {
    const v = urlInput.trim();
    if (!v) return;
    onPick({ ref: nicovideoRefFromUrl(v), url: v, label: 'ニコニコ BGM' });
  };

  const pickSoundCloud = () => {
    const v = urlInput.trim();
    if (!v) return;
    onPick({ ref: soundcloudRefFromUrl(v), url: v, label: 'SoundCloud BGM' });
  };

  const pickMmlPost = (p: Post) => {
    stopAllPreviews();
    const mml = extractMmlFromContent(p.content) || '';
    onPick({ ref: `mml:post:${p.id}`, rawMml: mml, label: `MML投稿 #${p.id}` });
  };

  const pickMmlRaw = () => {
    stopAllPreviews();
    const v = mmlInput.trim();
    if (!v) return;
    onPick({ ref: `mml:${v}`, rawMml: v, label: 'MML' });
  };

  const pickDirect = () => {
    stopAllPreviews();
    const v = urlInput.trim();
    if (!v) return;
    onPick({ ref: `direct:${v}`, url: v, label: v.length > 28 ? v.slice(0, 26) + '…' : v });
  };

  const tabBtn = (active: boolean) =>
    `shrink-0 whitespace-nowrap px-2.5 py-2 text-[11px] font-bold rounded-md transition flex items-center justify-center gap-1 ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-100/10'}`;

  return (
    <div className="absolute inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60" onClick={() => { stopAllPreviews(); onClose(); }}>
      <div
        className="bg-[#0b0e14] w-full sm:w-[420px] sm:rounded-2xl rounded-t-2xl border border-gray-800 shadow-2xl flex flex-col max-h-[85vh] animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <span className="text-xs font-bold text-gray-200">
            {mode === 'image' ? '画像を参照' : bgmKind === 'sfx' ? '効果音を参照' : 'BGMを参照'}
          </span>
          <button onClick={() => { stopAllPreviews(); onClose(); }} className="text-gray-400 hover:text-gray-200 p-1 rounded-full hover:bg-gray-100/10">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 p-2 bg-[#0f0f11] border-b border-gray-800 shrink-0">
          {mode === 'image' ? (
            <>
              {/* メタ（自分の素材）タブ: 使用履歴・マイシート。画像アップロード/投稿からの切り出しは「素材定義」パネルへ移動した。 */}
              {usedAssets.length > 0 && (
                <button className={tabBtn(imageTab === 'history')} onClick={() => changeImageTab('history')}>🕘 使用履歴</button>
              )}
              <button className={tabBtn(imageTab === 'mySheet')} onClick={() => changeImageTab('mySheet')}>🗂️ マイシート</button>
              {/* 内蔵素材（リポジトリ同梱）と、rpgen-search 由来の外部素材を分けて示す。 */}
              <button className={tabBtn(imageTab === 'local')} onClick={() => changeImageTab('local')}>🏰 内蔵素材</button>
              <button className={tabBtn(imageTab === 'rpgenSprite')} onClick={() => changeImageTab('rpgenSprite')}>🧩 外部素材</button>
              <button className={tabBtn(imageTab === 'rpgenWalk')} onClick={() => changeImageTab('rpgenWalk')}>🚶 外部歩行グラ</button>
              <button className={tabBtn(imageTab === 'smc')} onClick={() => changeImageTab('smc')}>🎮 SMC素材</button>
            </>
          ) : (
            <>
              {allowedBgmTabs.includes('youtube') && (
                <button className={tabBtn(bgmTab === 'youtube')} onClick={() => changeBgmTab('youtube')}><Video size={12} />YouTube</button>
              )}
              {allowedBgmTabs.includes('nicovideo') && (
                <button className={tabBtn(bgmTab === 'nicovideo')} onClick={() => changeBgmTab('nicovideo')}>📺 ニコニコ</button>
              )}
              {allowedBgmTabs.includes('soundcloud') && (
                <button className={tabBtn(bgmTab === 'soundcloud')} onClick={() => changeBgmTab('soundcloud')}>☁️ SoundCloud</button>
              )}
              {allowedBgmTabs.includes('mmlPost') && (
                <button className={tabBtn(bgmTab === 'mmlPost')} onClick={() => changeBgmTab('mmlPost')}><Music size={12} />MML投稿</button>
              )}
              {allowedBgmTabs.includes('rpgenSe') && (
                <button className={tabBtn(bgmTab === 'rpgenSe')} onClick={() => changeBgmTab('rpgenSe')}>🔊 効果音</button>
              )}
              {allowedBgmTabs.includes('builtinGame') && (
                <button className={tabBtn(bgmTab === 'builtinGame')} onClick={() => changeBgmTab('builtinGame')}>🎮 他ゲーム音源</button>
              )}
              {allowedBgmTabs.includes('mmlRaw') && (
                <button className={tabBtn(bgmTab === 'mmlRaw')} onClick={() => changeBgmTab('mmlRaw')}>♪ 直接</button>
              )}
              {allowedBgmTabs.includes('direct') && (
                <button className={tabBtn(bgmTab === 'direct')} onClick={() => changeBgmTab('direct')}>🔗 URL</button>
              )}
            </>
          )}
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 scrollbar-none">
          {/* Image: history（このゲーム内で既に使われている画像を再選択） */}
          {mode === 'image' && imageTab === 'history' && (
            <div className="grid grid-cols-6 gap-2">
              {usedAssets.map((a, i) => (
                <button
                  key={`${a.ref}-${i}`}
                  onClick={() => onPick(a)}
                  className="aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 bg-gray-900 group relative gimp-checkered-background"
                >
                  <AssetThumb refStr={a.ref} url={a.url} />
                  <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-gray-300 px-1 truncate">{a.label}</span>
                </button>
              ))}
              {usedAssets.length === 0 && (
                <p className="col-span-6 text-center text-[11px] text-gray-600 py-8">このゲームではまだ画像が使われていません</p>
              )}
            </div>
          )}

          {/* Image: RPGen sprites（人がまとめた素材集） / walk graphics */}
          {mode === 'image' && imageTab === 'rpgenSprite' && (
            <SpriteSheetBrowser onPick={onPick} />
          )}
          {mode === 'image' && imageTab === 'rpgenWalk' && (
            <RpgenAssetPanel kind="walk" onPick={onPick} />
          )}
          {mode === 'image' && imageTab === 'smc' && (
            <SMCAssetPanel onPick={onPick} />
          )}
          {mode === 'image' && imageTab === 'local' && (
            <LocalAssetPanel onPick={onPick} />
          )}
          {mode === 'image' && imageTab === 'mySheet' && (
            <UserSheetPanel onPick={onPick} userId={userId} />
          )}

          {/* BGM: youtube */}
          {mode === 'bgm' && bgmTab === 'youtube' && (
            <div className="space-y-2">
              <label className="block text-[10px] text-gray-500">YouTube URL</label>
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-200 outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-gray-600">動画をBGMとしてループ再生します（容量ゼロ）。</p>
              <button onClick={pickYoutube} disabled={!urlInput.trim()} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold">このBGMを使う</button>
            </div>
          )}

          {/* BGM: nicovideo */}
          {mode === 'bgm' && bgmTab === 'nicovideo' && (
            <div className="space-y-2">
              <label className="block text-[10px] text-gray-500">ニコニコ動画 URL / 動画ID</label>
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://www.nicovideo.jp/watch/sm... または sm12345678"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-200 outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-gray-600">ニコニコ動画をBGMとしてループ再生します。</p>
              <button onClick={pickNicovideo} disabled={!urlInput.trim()} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold">このBGMを使う</button>
            </div>
          )}

          {/* BGM: soundcloud */}
          {mode === 'bgm' && bgmTab === 'soundcloud' && (
            <div className="space-y-2">
              <label className="block text-[10px] text-gray-500">SoundCloud Track URL</label>
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://soundcloud.com/artist/track"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-200 outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-gray-600">SoundCloud 楽曲をBGMとしてループ再生します。</p>
              <button onClick={pickSoundCloud} disabled={!urlInput.trim()} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold">このBGMを使う</button>
            </div>
          )}

          {/* BGM: mml post */}
          {mode === 'bgm' && bgmTab === 'mmlPost' && (
            <>
              <p className="text-[10px] text-[#a3e635] mb-2">♪ MMLは楽譜データだけの超軽量BGM。音声ファイルを読み込まないので読み込みが一瞬で終わります。</p>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="MML投稿を検索"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
                />
              </div>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
              ) : (
                <div className="space-y-1.5">
                  {mmlPosts.map(p => {
                    const mml = extractMmlFromContent(p.content) || '';
                    const key = `post-${p.id}`;
                    const isPrev = previewKey === key;
                    const currentStep = isPrev ? (mmlStepInfo?.currentStep ?? 0) : 0;
                    const totalSteps = isPrev ? (mmlStepInfo?.totalSteps ?? 1) : 1;
                    return (
                      <div key={p.id} className="flex flex-col gap-1.5 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => previewMml(key, mml)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isPrev ? 'bg-red-600/20 text-red-400' : 'bg-[#a3e635]/20 text-[#a3e635]'}`}
                            title={isPrev ? '停止' : '試聴'}
                          >
                            {isPrev ? <Square size={11} /> : <Play size={11} className="ml-0.5" />}
                          </button>
                          <button onClick={() => pickMmlPost(p)} className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Music size={11} className="text-pink-400 shrink-0" />
                              <span className="text-[11px] text-gray-300 font-bold truncate">{getAvatarInfo(p.displayName).username} #{p.id}</span>
                            </div>
                            <p className="text-[10px] text-gray-500 font-mono truncate">{mml}</p>
                          </button>
                        </div>
                        {isPrev && (
                          <div className="flex items-center gap-2 px-1 pt-1 border-t border-gray-800">
                            <input
                              type="range"
                              min={0}
                              max={totalSteps}
                              value={Math.min(currentStep, totalSteps)}
                              onChange={(e) => seekMml(key, mml, Number(e.target.value))}
                              className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#a3e635]"
                            />
                            <span className="text-[9px] text-gray-400 font-mono shrink-0">
                              {Math.floor((currentStep / totalSteps) * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {mmlPosts.length === 0 && <p className="text-center text-[11px] text-gray-600 py-8">MML投稿がありません</p>}
                </div>
              )}
            </>
          )}

          {/* BGM: raw mml */}
          {mode === 'bgm' && bgmTab === 'mmlRaw' && (
            <div className="space-y-2">
              <p className="text-[10px] text-[#a3e635]">♪ MMLは楽譜データだけの超軽量BGM。音声ファイルを読み込まないので読み込みが一瞬で終わります。</p>
              <label className="block text-[10px] text-gray-500">MML（短い効果音/メロディ向け）</label>
              <textarea
                value={mmlInput}
                onChange={e => setMmlInput(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-200 outline-none focus:border-blue-500 h-20 font-mono resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => previewMml('raw', mmlInput)} disabled={!mmlInput.trim()}
                  className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 ${previewKey === 'raw' ? 'bg-red-600/20 text-red-400' : 'bg-[#a3e635]/20 text-[#a3e635]'}`}>
                  {previewKey === 'raw' ? <Square size={12} /> : <Play size={12} />}試聴
                </button>
                <button onClick={pickMmlRaw} disabled={!mmlInput.trim()} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold">このMMLを使う</button>
              </div>
              {previewKey === 'raw' && mmlStepInfo && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="range"
                    min={0}
                    max={mmlStepInfo.totalSteps}
                    value={Math.min(mmlStepInfo.currentStep, mmlStepInfo.totalSteps)}
                    onChange={(e) => seekMml('raw', mmlInput, Number(e.target.value))}
                    className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#a3e635]"
                  />
                  <span className="text-[9px] text-gray-400 font-mono">
                    {Math.floor((mmlStepInfo.currentStep / mmlStepInfo.totalSteps) * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* SE: direct URL (MP3/WAV) */}
          {mode === 'bgm' && bgmTab === 'direct' && (
            <div className="space-y-2">
              <label className="block text-[10px] text-gray-500">音声URL（MP3 / WAV 直リンク）</label>
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://example.com/sound.mp3"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-200 outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-gray-600">MP3/WAV の直リンクURLを入力。効果音に向いています。</p>
              {urlInput.trim() && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-900 border border-gray-700">
                  <button
                    onClick={() => toggleDirectAudioPreview(urlInput.trim())}
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${previewKey === 'directUrl' ? 'bg-red-600/20 text-red-400' : 'bg-blue-600/20 text-blue-400'}`}
                  >
                    {previewKey === 'directUrl' ? <Square size={11} /> : <Play size={11} className="ml-0.5" />}
                  </button>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[10px] text-gray-400">
                      <span>音声を試聴</span>
                      {directDuration > 0 && <span>{formatTime(directCurrentTime)} / {formatTime(directDuration)}</span>}
                    </div>
                    {previewKey === 'directUrl' && (
                      <input
                        type="range"
                        min={0}
                        max={directDuration || 100}
                        step={0.1}
                        value={directCurrentTime}
                        onChange={e => {
                          const val = Number(e.target.value);
                          if (directAudioRef.current) {
                            directAudioRef.current.currentTime = val;
                            setDirectCurrentTime(val);
                          }
                        }}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    )}
                  </div>
                </div>
              )}
              <button onClick={pickDirect} disabled={!urlInput.trim()} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold">このURLを使う</button>
            </div>
          )}

          {/* SE: RPGen sound library */}
          {mode === 'bgm' && bgmTab === 'rpgenSe' && (
            <RpgenAssetPanel kind="sound" onPick={res => { stopAllPreviews(); onPick(res); }} onPlayPreview={handleSubpanelPlayPreview} />
          )}

          {/* BGM/SE: other game project sound library (Undertale/Mario127/MegamanJS) */}
          {mode === 'bgm' && bgmTab === 'builtinGame' && (
            <BuiltinGameSoundPanel kind={bgmKind === 'sfx' ? 'sfx' : 'bgm'} onPick={res => { stopAllPreviews(); onPick(res); }} onPlayPreview={handleSubpanelPlayPreview} />
          )}
        </div>
      </div>
    </div>
  );
}
