'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Pen, Grid3x3, Music, X, Gamepad2 } from 'lucide-react';

import { Post, AnonymousUser, OriginType } from '@/lib/types';
import { api } from '@/lib/api';
import Header from '@/components/Header';
import TopTabs from '@/components/TopTabs';
import dynamic from 'next/dynamic';
import RankingSubTabs from '@/components/RankingSubTabs';
import RightDrawer from '@/components/RightDrawer';
import FeedList from '@/components/FeedList';
import BottomNav from '@/components/BottomNav';
import FAB from '@/components/FAB';
import CollabSelector from '@/components/CollabSelector';
import GameMaker, { type GameManifestDraft } from '@/components/GameMaker';
import LiveGameView from '@/components/LiveGameView';
import PostComposer from '@/components/PostComposer';
import SearchView from '@/components/SearchView';
import NotificationView from '@/components/NotificationView';
import MessageView from '@/components/MessageView';
import ProfileView from '@/components/ProfileView';

const DrawingEditor = dynamic(() => import('@/components/DrawingEditor'), { ssr: false });
const DotDrawingEditor = dynamic(() => import('@/components/DotDrawingEditor'), { ssr: false });
const MmlEditor = dynamic(() => import('@/components/MmlEditor'), { ssr: false });
const MmlPlayer = dynamic(() => import('@/components/MmlPlayer'), { ssr: false });

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPosts, setNewPosts] = useState<Post[]>([]);
  const postsRef = useRef<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentNav, setCurrentNav] = useState('home');
  const [topTab, setTopTab] = useState('everyone');
  const [rankCategory, setRankCategory] = useState('イイ');
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [currentUser, setCurrentUser] = useState<AnonymousUser | null>(null);
  const [server, setServer] = useState('/main');
  const [bbsMode, setBbsModeRaw] = useState('SNSモード');

  const setBbsMode = (m: string) => {
    setBbsModeRaw(m);
    if (typeof localStorage !== 'undefined') localStorage.setItem('unj_bbs_mode', m);
  };

  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('unj_bbs_mode') : null;
    if (saved) setBbsModeRaw(saved);
  }, []);
  const [notifCount, setNotifCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedMml, setAttachedMml] = useState<string | null>(null);
  const [originType, setOriginType] = useState<OriginType | undefined>(undefined);
  const [collabImageUrl, setCollabImageUrl] = useState<string | undefined>(undefined);
  const [showCollabSelector, setShowCollabSelector] = useState(false);
  const [gameDraft, setGameDraft] = useState<{ manifest: GameManifestDraft; title: string; preset: string } | null>(null);
  const [playingGame, setPlayingGame] = useState<{ manifest: GameManifestDraft; title: string; postId?: number } | null>(null);
  const [postGameDanmaku, setPostGameDanmaku] = useState<string[]>([]);
  const postGameLastIdRef = useRef(0);

  const heartQueue = useRef<Map<number, number>>(new Map());
  const heartTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const likeParity = useRef<Map<number, number>>(new Map());
  const likeTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const dislikeParity = useRef<Map<number, number>>(new Map());
  const dislikeTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const sessionInitialized = useRef(false);

  function getCookie(name: string): string | undefined {
    if (typeof document === 'undefined') return undefined;
    const match = document.cookie.match(`(?:^|;\\s*)${name}=([^;]*)`);
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  function setCookie(name: string, value: string, days: number) {
    if (typeof document === 'undefined') return;
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
  }

  useEffect(() => {
    if (sessionInitialized.current) return;
    sessionInitialized.current = true;
    let sessionId = getCookie('unj_reze_session');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      setCookie('unj_reze_session', sessionId, 365);
    }
    api.auth.anonymous(sessionId).then(user => {
      setUserId(user.displayName);
      setCurrentUser(user);
      api.notifications.unreadCount(user.displayName).then(({ count }) => {
        setNotifCount(count);
      }).catch(() => {});
      api.messages.list(user.displayName).then(msgs => {
        setMessageCount(msgs.length);
      }).catch(() => {});
    }).catch(() => {
      setUserId('名無しvFZ');
    });
  }, []);

  useEffect(() => {
    if (activeScreen !== 'postgame' || !playingGame?.postId) return;
    const pid = playingGame.postId;
    const poll = async () => {
      try {
        const res = await fetch(`/api/posts/${pid}/replies`);
        if (!res.ok) return;
        const replies: Post[] = await res.json();
        const newOnes = replies.filter(r => r.id > postGameLastIdRef.current);
        if (newOnes.length > 0) {
          postGameLastIdRef.current = Math.max(...newOnes.map(r => r.id));
          setPostGameDanmaku(prev => [...prev, ...newOnes.map(r => `${r.displayName}: ${r.content}`)]);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [activeScreen, playingGame?.postId]);

  const fetchPosts = useCallback(async () => {
    try {
      const data = await api.posts.list(userId);
      setPosts(data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (!userId) return;
    const intervalId = setInterval(async () => {
      try {
        const data = await api.posts.list(userId);
        const existingIds = new Set(postsRef.current.map(p => p.id));
        
        setNewPosts(currentNewPosts => {
          const newIds = new Set(currentNewPosts.map(p => p.id));
          const incomingNewPosts = data.filter(p => !existingIds.has(p.id) && !newIds.has(p.id));
          
          if (incomingNewPosts.length > 0) {
            return [...incomingNewPosts, ...currentNewPosts];
          }
          return currentNewPosts;
        });
      } catch (err) {
        // ignore errors
      }
    }, 15000);
    
    return () => clearInterval(intervalId);
  }, [userId]);

  const handleShowNewPosts = () => {
    setPosts(prev => [...newPosts, ...prev]);
    setNewPosts([]);
    document.getElementById('scrollable-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuickPost = () => {
    setComposerOpen(true);
  };

  const handleLike = (postId: number) => {
    setPosts(prev => prev.map(p => p.id !== postId ? p : {
      ...p, liked: !p.liked,
      likes: Math.max(0, p.liked ? p.likes - 1 : p.likes + 1),
      disliked: p.liked ? p.disliked : false,
      dislikes: p.liked ? p.dislikes : (p.disliked ? Math.max(0, p.dislikes - 1) : p.dislikes),
    }));
    const parity = (likeParity.current.get(postId) || 0) + 1;
    likeParity.current.set(postId, parity);
    if (likeTimers.current.has(postId)) clearTimeout(likeTimers.current.get(postId)!);
    likeTimers.current.set(postId, setTimeout(async () => {
      const p = likeParity.current.get(postId) || 0;
      likeParity.current.delete(postId);
      likeTimers.current.delete(postId);
      if (p % 2 === 0) return;
      const updated = await api.posts.like(postId, userId);
      setPosts(prev => prev.map(p2 => p2.id === postId ? updated : p2));
    }, 2000));
  };

  const handleDislike = (postId: number) => {
    setPosts(prev => prev.map(p => p.id !== postId ? p : {
      ...p, disliked: !p.disliked,
      dislikes: Math.max(0, p.disliked ? p.dislikes - 1 : p.dislikes + 1),
      liked: p.disliked ? p.liked : false,
      likes: p.disliked ? p.likes : (p.liked ? Math.max(0, p.likes - 1) : p.likes),
    }));
    const parity = (dislikeParity.current.get(postId) || 0) + 1;
    dislikeParity.current.set(postId, parity);
    if (dislikeTimers.current.has(postId)) clearTimeout(dislikeTimers.current.get(postId)!);
    dislikeTimers.current.set(postId, setTimeout(async () => {
      const p = dislikeParity.current.get(postId) || 0;
      dislikeParity.current.delete(postId);
      dislikeTimers.current.delete(postId);
      if (p % 2 === 0) return;
      const updated = await api.posts.dislike(postId, userId);
      setPosts(prev => prev.map(p2 => p2.id === postId ? updated : p2));
    }, 2000));
  };

  const handleRepost = async (postId: number) => {
    setPosts(prev => prev.map(p => p.id !== postId ? p : {
      ...p, reposted: !p.reposted,
      reposts: Math.max(0, p.reposted ? p.reposts - 1 : p.reposts + 1),
    }));
    const updated = await api.posts.repost(postId);
    setPosts(prev => prev.map(p => p.id === postId ? updated : p));
  };

  const handleHeart = (postId: number) => {
    setPosts(prev => prev.map(p => p.id !== postId ? p : { ...p, heartsTotal: (Number(p.heartsTotal) || 0) + 1 }));
    const current = heartQueue.current.get(postId) || 0;
    heartQueue.current.set(postId, current + 1);
    if (heartTimers.current.has(postId)) clearTimeout(heartTimers.current.get(postId)!);
    heartTimers.current.set(postId, setTimeout(async () => {
      const count = heartQueue.current.get(postId) || 0;
      heartQueue.current.delete(postId);
      heartTimers.current.delete(postId);
      const updated = await api.posts.heart(postId, userId, count);
      setPosts(prev => prev.map(p2 => p2.id === postId ? updated : p2));
    }, 2000));
  };

  const handleAddReply = async (postId: number, replyText: string) => {
    if (!replyText.trim()) return;
    const reply = await api.posts.replies.create(postId, {
      displayName: userId,
      content: replyText,
      parentPostId: postId,
    });
    setPosts(posts.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          repliesCount: p.repliesCount + 1,
          replies: [...p.replies, reply],
        };
      }
      return p;
    }));
  };

  const handleNavigate = (id: string) => {
    setCurrentNav(id);
    if (id === 'notifications') setNotifCount(0);
    if (id === 'messages') setMessageCount(0);
  };

  const handleCreatePost = async () => {
    if (!inputText.trim() && !attachedImage && !attachedMml) return;
    let imageSrc: string | undefined;
    if (attachedImage) {
      const result = await api.upload.image({ image: attachedImage });
      imageSrc = result.url;
    }
    let gameId: number | undefined;
    if (gameDraft) {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: gameDraft.preset, title: gameDraft.title, manifest: gameDraft.manifest }),
      });
      if (res.ok) {
        const savedGame = await res.json();
        gameId = savedGame.id;
      }
    }
    // #MML作曲行は1行目、自由コメントはその下の行として保存する
    // （パース側は行頭一致でMML行だけを抽出するため、コメントと混在させて良い）
    const parts: string[] = [];
    if (attachedMml) parts.push(`#MML作曲 ${attachedMml}`);
    if (inputText.trim()) parts.push(inputText.trim());
    const content = parts.join('\n');
    const post = await api.posts.create({
      displayName: userId,
      content,
      hasImage: !!attachedImage,
      imageSrc,
      avatarColor: "from-blue-500 to-indigo-600",
      gameId,
      originType,
    });
    setPosts([post, ...posts]);
    setInputText('');
    setAttachedImage(null);
    setAttachedMml(null);
    setGameDraft(null);
    setOriginType(undefined);
  };

  const handleOpenCollab = useCallback((post: Post) => {
    setCollabImageUrl(post.imageSrc);
    setShowCollabSelector(true);
  }, []);

  const handleCollabSelectDrawing = useCallback(() => {
    setShowCollabSelector(false);
    setActiveScreen('drawing');
  }, []);

  const handleCollabSelectDotDrawing = useCallback(() => {
    setShowCollabSelector(false);
    setActiveScreen('dotdrawing');
  }, []);

  const handleCloseCollabSelector = useCallback(() => {
    setShowCollabSelector(false);
    setCollabImageUrl(undefined);
  }, []);

  const handleSaveDrawing = (canvasData: string) => {
    setAttachedImage(canvasData);
    setActiveScreen(null);
    setCollabImageUrl(undefined);
    setInputText("#お絵描き 自作イラスト完成！");
  };

  const handleSaveDotDrawing = (canvasData: string) => {
    setAttachedImage(canvasData);
    setActiveScreen(null);
    setCollabImageUrl(undefined);
    setInputText("#ドット絵 自作ドット絵完成！");
  };

  const handleSaveMml = (mml: string) => {
    setActiveScreen(null);
    setAttachedMml(mml);
  };

  const handleOpenPostGame = async (gameId: number, postId?: number) => {
    try {
      const res = await fetch(`/api/games/${gameId}`);
      if (!res.ok) return;
      const game = await res.json();
      setPostGameDanmaku([]);
      postGameLastIdRef.current = 0;
      setPlayingGame({ manifest: game.manifest, title: game.title, postId });
      setActiveScreen('postgame');
    } catch {}
  };

  const handleSaveGame = (manifest: GameManifestDraft, meta: { title: string; preset: string }) => {
    setGameDraft({ manifest, title: meta.title, preset: meta.preset });
    setActiveScreen(null);
    setInputText((prev) => prev.trim() ? prev : `#ゲーム 「${meta.title}」を作ったよ！`);
  };

  return (
    <div className="bg-[#0b0e14] text-gray-100 h-screen w-full flex flex-col overflow-hidden select-none font-sans relative">
      <RightDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userId={userId}
        bbsMode={bbsMode}
        setBbsMode={setBbsMode}
        currentUser={currentUser}
      />

      {activeScreen === 'drawing' && (
        <DrawingEditor
          onClose={() => { setActiveScreen(null); setCollabImageUrl(undefined); }}
          onSave={handleSaveDrawing}
          collabImageUrl={collabImageUrl}
        />
      )}
      {activeScreen === 'dotdrawing' && (
        <DotDrawingEditor
          onClose={() => { setActiveScreen(null); setCollabImageUrl(undefined); }}
          onSave={handleSaveDotDrawing}
          collabImageUrl={collabImageUrl}
        />
      )}
      {activeScreen === 'gamemaker' && (
        <GameMaker onClose={() => setActiveScreen(null)} userId={userId} onSave={handleSaveGame} />
      )}
      {activeScreen === 'postgame' && playingGame && (
        <GameMaker
          onClose={() => { setActiveScreen(null); setPlayingGame(null); setPostGameDanmaku([]); }}
          userId={userId}
          initialManifest={playingGame.manifest}
          playOnly
          postId={playingGame.postId}
          danmakuComments={postGameDanmaku}
          onComment={async (text, displayName) => {
            if (!playingGame.postId) return;
            setPostGameDanmaku(prev => [...prev, `${displayName}: ${text}`]);
            await api.posts.replies.create(playingGame.postId, { displayName, content: text, parentPostId: playingGame.postId });
          }}
        />
      )}
      {activeScreen === 'mml' && (
        <MmlEditor
          onClose={() => setActiveScreen(null)}
          onSave={handleSaveMml}
        />
      )}

      {showCollabSelector && collabImageUrl && (
        <CollabSelector
          imageUrl={collabImageUrl}
          onSelectDrawing={handleCollabSelectDrawing}
          onSelectDotDrawing={handleCollabSelectDotDrawing}
          onClose={handleCloseCollabSelector}
        />
      )}

      <div className="relative w-full max-w-2xl mx-auto border-x border-gray-800 h-screen flex flex-col shrink-0">
        {!activeScreen && (
          <>
            <Header
              userId={userId}
              server={server}
              bbsMode={bbsMode}
              onOpenDrawer={() => setDrawerOpen(true)}
              onToggleBbsMode={() => setBbsMode(bbsMode === '掲示板モード' ? 'SNSモード' : '掲示板モード')}
            />

            {currentNav === 'home' && (
              <TopTabs
                activeTab={topTab}
                setActiveTab={(tab) => {
                  setTopTab(tab);
                  if (tab !== 'game') setActiveScreen(null);
                  if (tab === 'ranking') {
                    setRankCategory('イイ');
                  }
                }}
              />
            )}

            <div id="scrollable-content" className={`flex-1 scrollbar-none ${currentNav === 'home' && topTab === 'game' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto pb-20'}`}>
              {currentNav === 'home' && topTab === 'game' && (
                <LiveGameView
                  userId={userId}
                  sessionId={getCookie('unj_reze_session') || userId}
                />
              )}
              {currentNav === 'home' && topTab !== 'game' && (
                <>
                  {topTab !== 'ranking' && topTab !== 'game' && (
                    <div className="p-3 border-b border-gray-800/80 flex flex-col space-y-2">
                      <div className="flex items-start space-x-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shrink-0 border border-gray-700/50 flex items-center justify-center font-bold text-xs text-white">
                          {userId.substring(3, 5) || "vF"}
                        </div>
                        <div className="flex-1">
                          <textarea
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            className="w-full bg-gray-100/10 hover:bg-gray-100/15 focus:bg-gray-100/15 rounded-xl px-3 py-2.5 focus:outline-none transition-all placeholder:text-gray-500 text-sm resize-none h-20 text-gray-100"
                            placeholder="いまどうしてる？ #お絵描き #ゲーム"
                          />
                          {attachedImage && (
                            <div className="relative mt-2 rounded-lg overflow-hidden border border-gray-800 max-w-[180px]">
                              <img src={attachedImage} alt="添付お絵描き" className="w-full h-auto" />
                              <button
                                onClick={() => setAttachedImage(null)}
                                className="absolute top-1 right-1 bg-black/85 p-1 rounded-full text-white hover:bg-red-500"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}
                          {gameDraft && (
                            <div className="relative mt-2 flex items-center gap-2 rounded-lg border border-yellow-700/50 bg-yellow-500/10 px-3 py-2 max-w-[280px]">
                              <Gamepad2 size={16} className="text-yellow-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-yellow-200 truncate">{gameDraft.title}</p>
                                <p className="text-[10px] text-yellow-400/70">ゲームを添付中</p>
                              </div>
                              <button
                                onClick={() => setGameDraft(null)}
                                className="ml-auto text-yellow-300/70 hover:text-red-400 shrink-0"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}
                          {attachedMml && (
                            <div className="relative mt-2 rounded-lg border border-pink-700/50 bg-pink-500/10 px-3 py-2 max-w-[280px]">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-pink-300 flex items-center gap-1">
                                  <Music size={12} />
                                  MMLを添付中（試聴できます）
                                </span>
                                <button
                                  onClick={() => setAttachedMml(null)}
                                  className="text-pink-300/70 hover:text-red-400 shrink-0"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <MmlPlayer mml={attachedMml} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center pl-12">
                        <div className="flex space-x-2 text-gray-500">
                          <button
                            onClick={() => { setCollabImageUrl(undefined); setActiveScreen('drawing'); }}
                            className="p-2 hover:bg-gray-100/10 rounded-full hover:text-[#a3e635] transition-colors"
                            title="お絵描き"
                          >
                            <Pen size={18} />
                          </button>
                          <button
                            onClick={() => setActiveScreen('dotdrawing')}
                            className="p-2 hover:bg-gray-100/10 rounded-full hover:text-orange-400 transition-colors"
                            title="ドット絵専用お絵描き"
                          >
                            <Grid3x3 size={18} />
                          </button>
                          <button
                            onClick={() => setActiveScreen('mml')}
                            className="p-2 hover:bg-gray-100/10 rounded-full hover:text-pink-400 transition-colors"
                            title="MML作曲"
                          >
                            <Music size={18} />
                          </button>
                          <button
                            onClick={() => setActiveScreen('gamemaker')}
                            className="p-2 hover:bg-gray-100/10 rounded-full hover:text-yellow-400 transition-colors"
                            title="ゲーム作成"
                          >
                            <Gamepad2 size={18} />
                          </button>
                        </div>
                        <button
                          onClick={handleCreatePost}
                          disabled={!inputText.trim() && !attachedImage && !attachedMml}
                          className="bg-blue-600 text-white font-bold px-4 py-1.5 rounded-full text-xs hover:bg-blue-500 disabled:opacity-50 transition-colors"
                        >
                          投稿
                        </button>
                      </div>
                    </div>
                  )}

                  {topTab === 'ranking' && (
                    <RankingSubTabs
                      activeCategory={rankCategory}
                      setActiveCategory={setRankCategory}
                    />
                  )}

                  {newPosts.length > 0 && (
                    <div className="sticky top-4 z-10 flex justify-center w-full pointer-events-none my-2">
                      <button
                        onClick={handleShowNewPosts}
                        className="pointer-events-auto bg-blue-500/90 hover:bg-blue-400 backdrop-blur-md text-white px-5 py-2 rounded-full shadow-lg shadow-blue-500/20 text-sm font-bold flex items-center space-x-2 transition-all transform hover:scale-105 animate-in slide-in-from-top-4 fade-in duration-300"
                      >
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span>{newPosts.length}件の新しい投稿を表示</span>
                      </button>
                    </div>
                  )}

                  <FeedList
                    posts={posts}
                    activeTab={topTab}
                    rankCategory={rankCategory}
                    bbsMode={bbsMode}
                    onLike={handleLike}
                    onDislike={handleDislike}
                    onRepost={handleRepost}
                    onHeart={handleHeart}
                    onAddReply={handleAddReply}
                    onQuickPost={handleQuickPost}
                    openGame={(gameId?: number, postId?: number) => {
                      if (gameId) handleOpenPostGame(gameId, postId);
                    }}
                    openCollab={handleOpenCollab}
                    openMml={() => setActiveScreen('mml')}
                    currentUserSlug={currentUser?.slug}
                    onModerationChange={fetchPosts}
                  />
                </>
              )}

              {currentNav === 'search' && (
                <SearchView
                  onLike={handleLike}
                  onDislike={handleDislike}
                  onRepost={handleRepost}
                  onHeart={handleHeart}
                  onAddReply={handleAddReply}
                  onQuickPost={handleQuickPost}
                  openGame={(gameId?: number, postId?: number) => {
                    if (gameId) handleOpenPostGame(gameId, postId);
                  }}
                  openCollab={handleOpenCollab}
                  openMml={() => setActiveScreen('mml')}
                />
              )}
              {currentNav === 'notifications' && <NotificationView userId={userId} />}
              {currentNav === 'messages' && <MessageView userId={userId} />}
              {currentNav === 'profile' && (
                <ProfileView
                  userId={userId}
                  displayName={userId}
                  currentUserId={userId}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  onHeart={handleHeart}
                  onRepost={handleRepost}
                  openCollab={handleOpenCollab}
                />
              )}
            </div>

            <BottomNav current={currentNav} set={handleNavigate} notifCount={notifCount} messageCount={messageCount} />

            <FAB openText={handleQuickPost} />
          </>
        )}

        {composerOpen && (
          <PostComposer
            userId={userId}
            text={inputText}
            setText={setInputText}
            image={attachedImage}
            setImage={setAttachedImage}
            mml={attachedMml}
            setMml={setAttachedMml}
            originType={originType}
            setOriginType={setOriginType}
            onClose={() => setComposerOpen(false)}
            onSubmit={() => { handleCreatePost(); setComposerOpen(false); }}
            onOpenDrawing={() => { setComposerOpen(false); setActiveScreen('drawing'); }}
            onOpenDotDrawing={() => { setComposerOpen(false); setActiveScreen('dotdrawing'); }}
            onOpenMml={() => { setComposerOpen(false); setActiveScreen('mml'); }}
            onOpenGameMaker={() => { setComposerOpen(false); setActiveScreen('gamemaker'); }}
          />
        )}
      </div>
    </div>
  );
}
