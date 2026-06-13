'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Pen, Grid3x3, Music, X, Gamepad2 } from 'lucide-react';

import { Post, AnonymousUser } from '@/lib/types';
import { api } from '@/lib/api';
import Header from '@/components/Header';
import TopTabs from '@/components/TopTabs';
import RankingSubTabs from '@/components/RankingSubTabs';
import RightDrawer from '@/components/RightDrawer';
import FeedList from '@/components/FeedList';
import BottomNav from '@/components/BottomNav';
import FAB from '@/components/FAB';
import DrawingEditor from '@/components/DrawingEditor';
import DotDrawingEditor from '@/components/DotDrawingEditor';
import GamePlayer from '@/components/GamePlayer';
import GameMaker from '@/components/GameMaker';
import MmlEditor from '@/components/MmlEditor';
import PostComposer from '@/components/PostComposer';
import SearchView from '@/components/SearchView';
import NotificationView from '@/components/NotificationView';
import MessageView from '@/components/MessageView';
import ProfileView from '@/components/ProfileView';

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
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
  const [bbsMode, setBbsMode] = useState('掲示板モード');
  const [notifCount, setNotifCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [collabImageUrl, setCollabImageUrl] = useState<string | undefined>(undefined);

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
      api.notifications.list(user.displayName).then(notifs => {
        setNotifCount(notifs.length);
      }).catch(() => {});
      api.messages.list(user.displayName).then(msgs => {
        setMessageCount(msgs.length);
      }).catch(() => {});
    }).catch(() => {
      setUserId('名無しvFZ');
    });
  }, []);

  const fetchPosts = useCallback(async () => {
    try {
      const data = await api.posts.list(userId);
      setPosts(data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

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
    if (!inputText.trim() && !attachedImage) return;
    let imageSrc: string | undefined;
    if (attachedImage) {
      const result = await api.upload.image({ image: attachedImage });
      imageSrc = result.url;
    }
    const post = await api.posts.create({
      displayName: userId,
      content: inputText,
      hasImage: !!attachedImage,
      imageSrc,
      avatarColor: "from-blue-500 to-indigo-600",
    });
    setPosts([post, ...posts]);
    setInputText('');
    setAttachedImage(null);
  };

  const isDotDrawingPost = useCallback((post: Post) => /#ドット絵|ドット絵/i.test(post.content), []);

  const handleOpenCollab = useCallback((post: Post) => {
    setCollabImageUrl(post.imageSrc);
    setActiveScreen(isDotDrawingPost(post) ? 'dotdrawing' : 'drawing');
  }, [isDotDrawingPost]);

  const handleSaveDrawing = (canvasData: string) => {
    setAttachedImage(canvasData);
    setActiveScreen(null);
    setInputText("#お絵描き 自作イラスト完成！");
  };

  const handleSaveDotDrawing = (canvasData: string) => {
    setAttachedImage(canvasData);
    setActiveScreen(null);
    setInputText("#ドット絵 自作ドット絵完成！");
  };

  const handleSaveMml = (mml: string) => {
    setActiveScreen(null);
    setInputText(`#MML作曲 ${mml}`);
  };

  return (
    <div className="bg-[#0b0e14] text-gray-100 h-screen w-full flex flex-col overflow-hidden select-none font-sans relative">
      <RightDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userId={userId}
        setUserId={setUserId}
        server={server}
        setServer={setServer}
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
        />
      )}
      {activeScreen === 'gamemaker' && (
        <GameMaker onClose={() => setActiveScreen(null)} />
      )}
      {activeScreen === 'game' && (
        <GamePlayer onClose={() => setActiveScreen(null)} />
      )}
      {activeScreen === 'mml' && (
        <MmlEditor
          onClose={() => setActiveScreen(null)}
          onSave={handleSaveMml}
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
            />

            {currentNav === 'home' && (
              <TopTabs
                activeTab={topTab}
                setActiveTab={(tab) => {
                  setTopTab(tab);
                  if (tab === 'game') { setActiveScreen('game'); }
                  else { setActiveScreen(null); }
                  if (tab === 'ranking') {
                    setRankCategory('イイ');
                  }
                }}
              />
            )}

            <div className="flex-1 overflow-y-auto pb-20 scrollbar-none">
              {currentNav === 'home' && (
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
                          disabled={!inputText.trim() && !attachedImage}
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

                  <FeedList
                    posts={posts}
                    activeTab={topTab}
                    rankCategory={rankCategory}
                    onLike={handleLike}
                    onDislike={handleDislike}
                    onRepost={handleRepost}
                    onHeart={handleHeart}
                    onAddReply={handleAddReply}
                    onQuickPost={handleQuickPost}
                    openGame={() => setActiveScreen('game')}
                    openCollab={handleOpenCollab}
                    openMml={() => setActiveScreen('mml')}
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
                  openGame={() => setActiveScreen('game')}
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
