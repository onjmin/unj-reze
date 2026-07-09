'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Image as ImageIcon, Link2, Music, Video, Search, Loader2, Play, Square } from 'lucide-react';
import { api } from '@/lib/api';
import type { Post } from '@/lib/types';
import { extractMmlFromContent } from '@/lib/mml';
import { youtubeRefFromUrl } from '@/lib/asset-ref';
import RpgenAssetPanel from './RpgenAssetPanel';
import SpriteSheetBrowser from './SpriteSheetBrowser';
import SMCAssetPanel from './SMCAssetPanel';
import LocalAssetPanel from './LocalAssetPanel';
import BuiltinGameSoundPanel from './BuiltinGameSoundPanel';

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
  onPick: (result: PickResult) => void;
  onClose: () => void;
}

type ImageTab = 'posts' | 'walk' | 'url' | 'rpgenSprite' | 'rpgenWalk' | 'smc' | 'local';
type BgmTab = 'youtube' | 'mmlPost' | 'mmlRaw' | 'direct' | 'rpgenSe' | 'builtinGame';

// BGM欄と効果音欄で選べるタブを分ける。BGMはYouTube/MML/内蔵ゲーム音源/URL、効果音はrpgen効果音/内蔵ゲーム音源/URLのみ。
const BGM_TABS: BgmTab[] = ['youtube', 'mmlPost', 'builtinGame', 'mmlRaw', 'direct'];
const SFX_TABS: BgmTab[] = ['rpgenSe', 'builtinGame', 'direct'];

// モーダルは閉じるたびにアンマウントされるため、タブ選択とスクロール位置をモジュール変数で覚えておき、
// 再度開いたときに前回見ていた場所へ復元する。BGM欄/効果音欄は選べるタブが違うので別々に覚える。
let lastImageTab: ImageTab = 'posts';
const lastBgmTabByKind: Record<'bgm' | 'sfx', BgmTab> = { bgm: 'youtube', sfx: 'rpgenSe' };
const scrollPositions = new Map<string, number>();

export default function ContentPicker({ mode, bgmKind = 'bgm', userId, onPick, onClose }: ContentPickerProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [imageTab, setImageTab] = useState<ImageTab>(lastImageTab);
  const allowedBgmTabs = bgmKind === 'sfx' ? SFX_TABS : BGM_TABS;
  const [bgmTab, setBgmTab] = useState<BgmTab>(() => {
    const last = lastBgmTabByKind[bgmKind];
    return allowedBgmTabs.includes(last) ? last : allowedBgmTabs[0];
  });
  const [urlInput, setUrlInput] = useState('');
  const [mmlInput, setMmlInput] = useState('T120 o4 c d e f g a b');
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentTab = mode === 'image' ? imageTab : bgmTab;

  const changeImageTab = (tab: ImageTab) => { lastImageTab = tab; setImageTab(tab); };
  const changeBgmTab = (tab: BgmTab) => { lastBgmTabByKind[bgmKind] = tab; setBgmTab(tab); };

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

  const previewMml = async (key: string, mml: string) => {
    stopRef.current?.();
    stopRef.current = null;
    if (previewKey === key) { setPreviewKey(null); return; }
    if (!mml.trim()) return;
    try {
      const { playMML } = await import('@onjmin/dtm');
      const bgm = playMML(mml, {
        loop: false,
        onStop: () => {
          setPreviewKey(null);
          stopRef.current = null;
        }
      });
      stopRef.current = () => {
        bgm.stop();
        bgm.destroy();
      };
      setPreviewKey(key);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => () => { stopRef.current?.(); }, []);

  useEffect(() => {
    let alive = true;
    api.posts.list(userId)
      .then(data => { if (alive) setPosts(data); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId]);

  const q = query.trim().toLowerCase();
  const imagePosts = posts.filter(p => p.hasImage && p.imageSrc &&
    (!q || p.content.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q)));
  // 歩行グラ: #歩行グラ タグ付きの画像投稿を優先候補に
  const walkPosts = posts.filter(p => p.hasImage && p.imageSrc &&
    /歩行|walk|スプライト|sprite/i.test(p.content) &&
    (!q || p.content.toLowerCase().includes(q)));
  const mmlPosts = posts.filter(p => {
    const mml = extractMmlFromContent(p.content);
    return !!mml && (!q || p.content.toLowerCase().includes(q));
  });

  const pickImagePost = (p: Post, scheme: 'post' | 'walk') => {
    onPick({
      ref: scheme === 'post' ? `post:${p.id}` : `walk:${p.id}`,
      url: p.imageSrc,
      label: `${scheme === 'post' ? '画像' : '歩行グラ'} #${p.id}`,
    });
  };

  const pickUrl = () => {
    const v = urlInput.trim();
    if (!v) return;
    onPick({ ref: `url:${v}`, url: v, label: v.slice(0, 26) });
  };

  const pickYoutube = () => {
    const v = urlInput.trim();
    if (!v) return;
    onPick({ ref: youtubeRefFromUrl(v), url: v, label: 'YouTube BGM' });
  };

  const pickMmlPost = (p: Post) => {
    const mml = extractMmlFromContent(p.content) || '';
    onPick({ ref: `mml:post:${p.id}`, rawMml: mml, label: `MML投稿 #${p.id}` });
  };

  const pickMmlRaw = () => {
    const v = mmlInput.trim();
    if (!v) return;
    onPick({ ref: `mml:${v}`, rawMml: v, label: 'MML' });
  };

  const pickDirect = () => {
    const v = urlInput.trim();
    if (!v) return;
    onPick({ ref: `direct:${v}`, url: v, label: v.length > 28 ? v.slice(0, 26) + '…' : v });
  };

  const tabBtn = (active: boolean) =>
    `shrink-0 whitespace-nowrap px-2.5 py-2 text-[11px] font-bold rounded-md transition flex items-center justify-center gap-1 ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-100/10'}`;

  return (
    <div className="absolute inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#0b0e14] w-full sm:w-[420px] sm:rounded-2xl rounded-t-2xl border border-gray-800 shadow-2xl flex flex-col max-h-[85vh] animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <span className="text-xs font-bold text-gray-200">
            {mode === 'image' ? '画像を参照' : bgmKind === 'sfx' ? '効果音を参照' : 'BGMを参照'}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 p-1 rounded-full hover:bg-gray-100/10">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 p-2 bg-[#0f0f11] border-b border-gray-800 shrink-0">
          {mode === 'image' ? (
            <>
              <button className={tabBtn(imageTab === 'posts')} onClick={() => changeImageTab('posts')}><ImageIcon size={12} />画像投稿</button>
              <button className={tabBtn(imageTab === 'local')} onClick={() => changeImageTab('local')}>🏰 内蔵素材</button>
              <button className={tabBtn(imageTab === 'rpgenSprite')} onClick={() => changeImageTab('rpgenSprite')}>🧩 素材</button>
              <button className={tabBtn(imageTab === 'rpgenWalk')} onClick={() => changeImageTab('rpgenWalk')}>🚶 歩行グラ</button>
              <button className={tabBtn(imageTab === 'walk')} onClick={() => changeImageTab('walk')}>📥 投稿グラ</button>
              <button className={tabBtn(imageTab === 'smc')} onClick={() => changeImageTab('smc')}>🎮 SMC素材</button>
              <button className={tabBtn(imageTab === 'url')} onClick={() => changeImageTab('url')}><Link2 size={12} />URL</button>
            </>
          ) : (
            <>
              {allowedBgmTabs.includes('youtube') && (
                <button className={tabBtn(bgmTab === 'youtube')} onClick={() => changeBgmTab('youtube')}><Video size={12} />YouTube</button>
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
          {/* Image: posts / walk */}
          {mode === 'image' && (imageTab === 'posts' || imageTab === 'walk') && (
            <>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="投稿を検索"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
                />
              </div>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(imageTab === 'posts' ? imagePosts : walkPosts).map(p => (
                    <button
                      key={p.id}
                      onClick={() => pickImagePost(p, imageTab === 'posts' ? 'post' : 'walk')}
                      className="aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 bg-gray-900 group relative"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imageSrc} alt="" className="w-full h-full object-cover" style={{ imageRendering: imageTab === 'walk' ? 'pixelated' : 'auto' }} />
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-gray-300 px-1 truncate">#{p.id}</span>
                    </button>
                  ))}
                  {(imageTab === 'posts' ? imagePosts : walkPosts).length === 0 && (
                    <p className="col-span-3 text-center text-[11px] text-gray-600 py-8">該当する投稿がありません</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Image: url */}
          {mode === 'image' && imageTab === 'url' && (
            <div className="space-y-2">
              <label className="block text-[10px] text-gray-500">画像URL（直リンク / imgur 等）</label>
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://i.imgur.com/xxxx.png"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-200 outline-none focus:border-blue-500"
              />
              {urlInput.trim() && (
                <div className="rounded-lg border border-gray-700 overflow-hidden max-h-40 flex items-center justify-center bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlInput} alt="" className="max-w-full max-h-40 object-contain" />
                </div>
              )}
              <button onClick={pickUrl} disabled={!urlInput.trim()} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold">この画像を使う</button>
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
                    return (
                      <div key={p.id} className="flex items-center gap-1.5 p-2 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-900">
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
                            <span className="text-[11px] text-gray-300 font-bold truncate">{p.displayName} #{p.id}</span>
                          </div>
                          <p className="text-[10px] text-gray-500 font-mono truncate">{mml}</p>
                        </button>
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
              <button onClick={pickDirect} disabled={!urlInput.trim()} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold">このURLを使う</button>
            </div>
          )}

          {/* SE: RPGen sound library */}
          {mode === 'bgm' && bgmTab === 'rpgenSe' && (
            <RpgenAssetPanel kind="sound" onPick={onPick} />
          )}

          {/* BGM/SE: other game project sound library (Undertale/Mario127/MegamanJS) */}
          {mode === 'bgm' && bgmTab === 'builtinGame' && (
            <BuiltinGameSoundPanel kind={bgmKind === 'sfx' ? 'sfx' : 'bgm'} onPick={onPick} />
          )}
        </div>
      </div>
    </div>
  );
}
