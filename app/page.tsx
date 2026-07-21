'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { Post, AnonymousUser, OriginType } from '@/lib/types';
import { api } from '@/lib/api';
import { usePostActions } from '@/lib/hooks/usePostActions';
import { ensureSessionId } from '@/lib/session';
import { decodeId } from '@/lib/sqids';
import { stripMmlLine, extractMmlFromContent } from '@/lib/mml';
import Header from '@/components/Header';
import EditPostModal from '@/components/EditPostModal';
import TopTabs, { type FeedSubMode } from '@/components/TopTabs';
import dynamic from 'next/dynamic';
import RankingSubTabs from '@/components/RankingSubTabs';
import FeedList from '@/components/FeedList';
import BottomNav from '@/components/BottomNav';
import LeftSidebar from '@/components/LeftSidebar';
import RightSidebar from '@/components/RightSidebar';
import FAB from '@/components/FAB';
import CollabSelector from '@/components/CollabSelector';
import GameMaker, { type GameManifestDraft } from '@/components/GameMaker';
import LiveGameView from '@/components/LiveGameView';
import PostComposer from '@/components/PostComposer';
import AttachmentDiscardModal from '@/components/AttachmentDiscardModal';
import ToastContainer from '@/components/ToastContainer';
import HeartBurst from '@/components/HeartBurst';
import { showToast, triggerHeartBurst } from '@/lib/toast';

const DrawingEditor = dynamic(() => import('@/components/DrawingEditor'), { ssr: false });
const DotDrawingEditor = dynamic(() => import('@/components/DotDrawingEditor'), { ssr: false });
const MmlEditor = dynamic(() => import('@/components/MmlEditor'), { ssr: false });

export default function App() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPosts, setNewPosts] = useState<Post[]>([]);
  const postsRef = useRef<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentNav, setCurrentNav] = useState('home');
  const [topTab, setTopTab] = useState('everyone');
  const [feedSubMode, setFeedSubMode] = useState<FeedSubMode>('threads');
  const [rankCategory, setRankCategory] = useState('イイ');
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTargetPost, setReplyTargetPost] = useState<Post | null>(null);
  /** 返信送信の排他制御。送信中の再送信を弾き、遅れて完了した送信が
   *  その後に開いたコンポーザ/エディタの状態を壊さないようにする。 */
  const replySubmittingRef = useRef(false);
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

    try {
      const cached = localStorage.getItem('unj_current_user');
      if (cached) setCurrentUser(JSON.parse(cached));
    } catch {}

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mention = params.get('mention');
      if (mention) {
        handleQuickPost(`@${mention}`);
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }

      try {
        const pending = sessionStorage.getItem('unj_pending_game');
        if (pending) {
          sessionStorage.removeItem('unj_pending_game');
          const { gameId, postId, returnTo } = JSON.parse(pending);
          if (returnTo) setPendingReturnTo(returnTo);
          if (gameId) handleOpenPostGame(gameId, postId);
        }
      } catch {}
    }
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
  const [playingGame, setPlayingGame] = useState<{ manifest: GameManifestDraft; title: string; postId?: string; gameId?: string; creatorSlug?: string } | null>(null);
  const [postGameDanmaku, setPostGameDanmaku] = useState<string[]>([]);
  const postGameLastIdRef = useRef(0);
  const [discardModalConfig, setDiscardModalConfig] = useState<{
    discardType: 'image' | 'mml' | 'game';
    targetScreen: 'drawing' | 'dotdrawing' | 'mml' | 'gamemaker';
  } | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [originalPostContent, setOriginalPostContent] = useState<string>('');
  const [showGlobalEditModal, setShowGlobalEditModal] = useState(false);

  const sessionInitialized = useRef(false);

  useEffect(() => {
    if (sessionInitialized.current) return;
    sessionInitialized.current = true;
    const sessionId = ensureSessionId();
    api.auth.anonymous(sessionId).then(user => {
      setUserId(user.displayName);
      setCurrentUser(user);
      localStorage.setItem('unj_current_user', JSON.stringify(user));
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

  // Load cached posts from localStorage on mount to show content instantly
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('unj_cached_posts');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPosts(parsed);
            postsRef.current = parsed;
            setLoading(false);
          }
        } catch (e) {
          console.error('Failed to parse cached posts', e);
        }
      }
    }
  }, []);

  // Update localStorage cache whenever posts are successfully updated/loaded
  useEffect(() => {
    if (posts.length > 0 && typeof localStorage !== 'undefined') {
      localStorage.setItem('unj_cached_posts', JSON.stringify(posts));
    }
  }, [posts]);

  useEffect(() => {
    if (activeScreen !== 'postgame' || !playingGame?.postId) return;
    const pid = playingGame.postId;
    const poll = async () => {
      try {
        const res = await fetch(`/api/posts/${pid}/replies`);
        if (!res.ok) return;
        const replies: Post[] = await res.json();
        const newOnes = replies.filter(r => (decodeId(r.id) || 0) > postGameLastIdRef.current);
        if (newOnes.length > 0) {
          postGameLastIdRef.current = Math.max(...newOnes.map(r => decodeId(r.id) || 0));
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
      postsRef.current = data;
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
        const existingIds = new Set(postsRef.current.map(p => String(p.id)));
        
        setNewPosts(currentNewPosts => {
          const newIds = new Set(currentNewPosts.map(p => String(p.id)));
          const incomingNewPosts = data.filter(p => !existingIds.has(String(p.id)) && !newIds.has(String(p.id)));
          
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

  // Socket.io を使わないため、通知一覧のポーリング差分で「フォローされた」「いいね／ハートされた」を検知し、
  // Snackbar通知とハート受信時の演出を出す。初回ポーリングは既存通知をseenに登録するだけでトーストは出さない
  // （履歴を新着として誤検知しないため）。以降は未見のIDだけをトースト＆ハート数はSetサイズを上限で刈り込んで抑える。
  const seenNotifIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const notifs = await api.notifications.list(userId);
        if (cancelled) return;
        if (seenNotifIds.current === null) {
          seenNotifIds.current = new Set(notifs.map(n => String(n.id)));
        } else {
          const freshOnes = notifs.filter(n => !seenNotifIds.current!.has(String(n.id)));
          for (const n of freshOnes) {
            seenNotifIds.current!.add(String(n.id));
            if (n.type === 'follow') {
              showToast('info', `${n.user}さんにフォローされました`);
            } else if (n.type === 'like') {
              showToast('info', `${n.user}さんがあなたの投稿にいいねしました`);
            } else if (n.type === 'heart') {
              showToast('info', `${n.user}さんがあなたの投稿にハートを送りました`);
              triggerHeartBurst();
            }
          }
          if (seenNotifIds.current!.size > 500) {
            seenNotifIds.current = new Set(notifs.map(n => String(n.id)));
          }
        }
        setNotifCount(notifs.filter(n => !n.read).length);
      } catch {
        // ignore polling errors
      }
    };
    poll();
    const id = setInterval(poll, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [userId]);

  const handleShowNewPosts = () => {
    setPosts(prev => [...newPosts, ...prev]);
    setNewPosts([]);
    document.getElementById('scrollable-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOuterWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const scrollable = document.getElementById('scrollable-content');
    if (!scrollable) return;
    const rightSidebar = document.getElementById('right-sidebar');
    if (rightSidebar && rightSidebar.contains(e.target as Node)) {
      return;
    }
    if (!scrollable.contains(e.target as Node)) {
      scrollable.scrollTop += e.deltaY;
    }
  };

  const handleQuickPost = (text?: string) => {
    setComposerOpen(true);
    if (text && typeof text === 'string') {
      setInputText(prev => prev ? `${prev} ${text} ` : `${text} `);
    }
  };

  const updatePost = useCallback((postId: string, updater: (p: Post) => Post) => {
    setPosts(prev => {
      const next = prev.map(p => p.id === postId ? updater(p) : p);
      postsRef.current = next;
      return next;
    });
  }, []);

  const { handleLike, handleDislike, handleRepost, handleHeart, handleAddReply } = usePostActions(
    userId,
    updatePost,
    { avatarUrl: currentUser?.avatarUrl }
  );

  const handleCreateReplyFromComposer = async (postId: string) => {
    if (replySubmittingRef.current) return;
    replySubmittingRef.current = true;
    const parts: string[] = [];
    if (inputText.trim()) parts.push(inputText.trim());
    if (attachedMml) parts.push(`#mml ${attachedMml}`);
    const content = parts.join('\n');

    const tempId = `temp-${Date.now()}`;
    const optimisticReply: Post = {
      id: tempId, displayName: userId, createdAt: new Date().toISOString(), time: "たった今", content,
      likes: 0, dislikes: 0, liked: false, disliked: false,
      repliesCount: 0, reposts: 0, reposted: false,
      avatarColor: "from-blue-500 to-indigo-600",
      heartsTotal: 0, replies: [],
      threadId: postId, parentPostId: postId,
      hasImage: !!attachedImage,
      imageSrc: attachedImage ?? undefined,
      originType,
    };
    setPosts(prev => {
      const next = prev.map(p => p.id === postId
        ? { ...p, repliesCount: p.repliesCount + 1, replies: [...p.replies, optimisticReply] }
        : p);
      postsRef.current = next;
      return next;
    });

    setInputText('');
    setAttachedImage(null);
    setAttachedMml(null);
    setGameDraft(null);
    setOriginType(undefined);

    try {
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
          body: JSON.stringify({ preset: gameDraft.preset, title: gameDraft.title, manifest: gameDraft.manifest, creatorSlug: currentUser?.slug }),
        });
        if (res.ok) {
          const savedGame = await res.json();
          gameId = savedGame.id;
        }
      }

      const reply = await api.posts.replies.create(postId, {
        displayName: userId,
        content,
        parentPostId: postId,
        hasImage: !!attachedImage,
        imageSrc,
        gameId,
        originType,
      });

      setPosts(prev => {
        const next = prev.map(p => p.id === postId
          ? { ...p, replies: p.replies.map(r => r.id === tempId ? { ...reply, avatarUrl: reply.avatarUrl ?? currentUser?.avatarUrl } : r) }
          : p);
        postsRef.current = next;
        return next;
      });
    } catch {
      setPosts(prev => {
        const next = prev.map(p => p.id === postId
          ? { ...p, repliesCount: Math.max(0, p.repliesCount - 1), replies: p.replies.filter(r => r.id !== tempId) }
          : p);
        postsRef.current = next;
        return next;
      });
      showToast('error', '返信の送信に失敗しました');
    } finally {
      replySubmittingRef.current = false;
    }
  };

  const handleNavigate = (id: string) => {
    setCurrentNav(id);
  };

  const handleCreatePost = async () => {
    if (!inputText.trim() && !attachedImage && !attachedMml) return;
    // #MML作曲行は1行目、自由コメントはその下の行として保存する
    // （パース側は行頭一致でMML行だけを抽出するため、コメントと混在させて良い）
    const parts: string[] = [];
    if (inputText.trim()) parts.push(inputText.trim());
    if (attachedMml) parts.push(`#mml ${attachedMml}`);
    const content = parts.join('\n');

    const tempId = `temp-${Date.now()}`;
    const optimisticPost: Post = {
      id: tempId, displayName: userId, createdAt: new Date().toISOString(), time: "たった今", content,
      likes: 0, dislikes: 0, liked: false, disliked: false,
      repliesCount: 0, reposts: 0, reposted: false,
      avatarColor: currentUser?.avatarColor || "from-blue-500 to-indigo-600",
      avatarUrl: currentUser?.avatarUrl,
      heartsTotal: 0, replies: [],
      threadId: tempId, parentPostId: undefined,
      hasImage: !!attachedImage,
      imageSrc: attachedImage ?? undefined,
      originType,
    };
    setPosts(prev => { const next = [optimisticPost, ...prev]; postsRef.current = next; return next; });
    setInputText('');
    setAttachedImage(null);
    setAttachedMml(null);
    setGameDraft(null);
    setOriginType(undefined);

    try {
      let imageSrc: string | undefined;
      if (attachedImage) {
        const result = await api.upload.image({ image: attachedImage });
        imageSrc = result.url;
      }
      let gameId: string | undefined;
      if (gameDraft) {
        const res = await fetch('/api/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset: gameDraft.preset, title: gameDraft.title, manifest: gameDraft.manifest, creatorSlug: currentUser?.slug }),
        });
        if (res.ok) {
          const savedGame = await res.json();
          gameId = savedGame.id;
        }
      }
      const post = await api.posts.create({
        displayName: userId,
        content,
        hasImage: !!attachedImage,
        imageSrc,
        avatarColor: "from-blue-500 to-indigo-600",
        gameId,
        originType,
      });
      setPosts(prev => {
        const next = prev.map(p => p.id === tempId ? { ...post, avatarUrl: post.avatarUrl ?? currentUser?.avatarUrl } : p);
        postsRef.current = next;
        return next;
      });
    } catch {
      setPosts(prev => {
        const next = prev.filter(p => p.id !== tempId);
        postsRef.current = next;
        return next;
      });
      showToast('error', '投稿に失敗しました');
    }
  };

  const handleOpenCollab = useCallback((post: Post) => {
    const postMml = extractMmlFromContent(post.content);
    if (!post.hasImage && postMml) {
      setAttachedMml(postMml);
      setActiveScreen('mml');
      return;
    }
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

  const handleEditPost = (post: Post) => {
    setEditingPost(post);
    setOriginalPostContent(post.content);
    setShowGlobalEditModal(true);
  };

  const handleEditPostImage = (post: Post) => {
    setEditingPost(post);
    setOriginalPostContent(prev => prev || post.content);
    setCollabImageUrl(post.imageSrc);
    setShowGlobalEditModal(false);
    if (post.content.includes('#ドット絵')) {
      setActiveScreen('dotdrawing');
    } else {
      setActiveScreen('drawing');
    }
  };

  const handleEditPostMml = (post: Post) => {
    setEditingPost(post);
    setOriginalPostContent(prev => prev || post.content);
    setShowGlobalEditModal(false);
    setActiveScreen('mml');
  };

  const handleSaveDrawing = async (canvasData: string) => {
    if (editingPost) {
      setEditingPost(prev => prev ? { ...prev, imageSrc: canvasData } : null);
      setActiveScreen(null);
      setCollabImageUrl(undefined);
      setShowGlobalEditModal(true);
      return;
    }
    setAttachedImage(canvasData);
    setActiveScreen(null);
    setCollabImageUrl(undefined);
    setInputText("#お絵描き 自作イラスト完成！");
  };

  const handleSaveDotDrawing = async (canvasData: string) => {
    if (editingPost) {
      setEditingPost(prev => prev ? { ...prev, imageSrc: canvasData } : null);
      setActiveScreen(null);
      setCollabImageUrl(undefined);
      setShowGlobalEditModal(true);
      return;
    }
    setAttachedImage(canvasData);
    setActiveScreen(null);
    setCollabImageUrl(undefined);
    setInputText("#ドット絵 自作ドット絵完成！");
  };

  const handleSaveMml = async (mml: string) => {
    if (editingPost) {
      const stripped = stripMmlLine(editingPost.content);
      const newContent = `${stripped}\n#mml ${mml}`.trim();
      setEditingPost(prev => prev ? { ...prev, content: newContent } : null);
      setActiveScreen(null);
      setShowGlobalEditModal(true);
      return;
    }
    setActiveScreen(null);
    setAttachedMml(mml);
  };

  const handleOpenPostGame = async (gameId: string, postId?: string) => {
    setShowGlobalEditModal(false);
    try {
      const res = await fetch(`/api/games/${gameId}`);
      if (!res.ok) return;
      const game = await res.json();
      setPostGameDanmaku([]);
      postGameLastIdRef.current = 0;
      setPlayingGame({ manifest: game.manifest, title: game.title, postId, gameId, creatorSlug: game.creatorSlug });
      setActiveScreen('postgame');
    } catch {}
  };

  const [pendingReturnTo, setPendingReturnTo] = useState<string | null>(null);

  const handleSaveEditedGame = async (manifest: GameManifestDraft, meta: { title: string; preset: string }) => {
    if (!playingGame?.gameId) return;
    try {
      await fetch(`/api/games/${playingGame.gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: meta.title, manifest, userSlug: currentUser?.slug }),
      });
    } catch {}
    setActiveScreen(null);
    setPlayingGame(null);
    setPostGameDanmaku([]);
    if (editingPost) {
      setShowGlobalEditModal(true);
    }
  };

  const handleSaveGame = (manifest: GameManifestDraft, meta: { title: string; preset: string }) => {
    setGameDraft({ manifest, title: meta.title, preset: meta.preset });
    setActiveScreen(null);
    setInputText((prev) => prev.trim() ? prev : `#ゲーム 「${meta.title}」を作ったよ！`);
  };

  const handleOpenEditor = (screenType: 'drawing' | 'dotdrawing' | 'mml' | 'gamemaker') => {
    const hasImage = !!attachedImage;
    const hasMml = !!attachedMml;
    const hasGame = !!gameDraft;

    if (screenType === 'drawing' || screenType === 'dotdrawing') {
      if (hasMml) {
        setDiscardModalConfig({ discardType: 'mml', targetScreen: screenType });
        return;
      }
      if (hasGame) {
        setDiscardModalConfig({ discardType: 'game', targetScreen: screenType });
        return;
      }
    } else if (screenType === 'mml') {
      if (hasImage) {
        setDiscardModalConfig({ discardType: 'image', targetScreen: screenType });
        return;
      }
      if (hasGame) {
        setDiscardModalConfig({ discardType: 'game', targetScreen: screenType });
        return;
      }
    } else if (screenType === 'gamemaker') {
      if (hasImage) {
        setDiscardModalConfig({ discardType: 'image', targetScreen: screenType });
        return;
      }
      if (hasMml) {
        setDiscardModalConfig({ discardType: 'mml', targetScreen: screenType });
        return;
      }
    }

    setComposerOpen(false);
    setActiveScreen(screenType);
  };

  const handleConfirmDiscard = () => {
    if (!discardModalConfig) return;
    const { discardType, targetScreen } = discardModalConfig;

    if (discardType === 'image') setAttachedImage(null);
    if (discardType === 'mml') setAttachedMml(null);
    if (discardType === 'game') setGameDraft(null);

    setComposerOpen(false);
    setActiveScreen(targetScreen);
    setDiscardModalConfig(null);
  };

  return (
    <div className="bg-[#0b0e14] text-gray-100 h-dvh w-full flex flex-col overflow-hidden select-none font-sans relative">
      <ToastContainer />
      <HeartBurst />

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
        <GameMaker onClose={() => setActiveScreen(null)} userId={userId} onSave={handleSaveGame} initialManifest={gameDraft?.manifest} />
      )}
      {activeScreen === 'postgame' && playingGame && (
        <GameMaker
          onClose={() => {
            setActiveScreen(null);
            setPlayingGame(null);
            setPostGameDanmaku([]);
            if (editingPost) {
              setShowGlobalEditModal(true);
            } else if (pendingReturnTo) {
              const url = pendingReturnTo;
              setPendingReturnTo(null);
              window.location.href = url;
              return;
            }
          }}
          userId={userId}
          initialManifest={playingGame.manifest}
          playOnly={!editingPost}
          onSave={editingPost && !!currentUser?.slug && playingGame.creatorSlug === currentUser.slug ? handleSaveEditedGame : undefined}
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
          onClose={() => {
            setActiveScreen(null);
            if (editingPost) setShowGlobalEditModal(true);
          }}
          onSave={handleSaveMml}
          initialMml={(editingPost ? extractMmlFromContent(editingPost.content) : attachedMml) || undefined}
          isEditing={!!editingPost}
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

      <div className="w-full h-dvh flex justify-center overflow-hidden bg-[#0b0e14]" onWheel={handleOuterWheel}>
        <LeftSidebar
          current={currentNav}
          set={handleNavigate}
          notifCount={notifCount}
          messageCount={messageCount}
          userAvatarUrl={currentUser?.avatarUrl}
          userSlug={currentUser?.slug}
          onPost={() => handleQuickPost()}
        />
        <div className="relative w-full max-w-2xl border-x border-gray-800 h-dvh flex flex-col shrink-0 overflow-hidden">
        {!activeScreen && (
          <>
            <Header
              userId={userId}
              server={server}
              bbsMode={bbsMode}
              onOpenSettings={() => router.push('/settings')}
              onToggleBbsMode={() => setBbsMode(bbsMode === '掲示板モード' ? 'SNSモード' : '掲示板モード')}
            />

            {currentNav === 'home' && (() => {
              const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
              const recentPosts = posts.filter(p => new Date(p.createdAt).getTime() >= dayAgo);
              const latestThreadCount = recentPosts.length;
              const latestReplyCount = recentPosts.reduce((sum, p) => sum + p.repliesCount, 0);
              const mediaCount = posts.filter(p => p.hasImage).length;
              return (
                <TopTabs
                  activeTab={topTab}
                  setActiveTab={(tab) => {
                    setTopTab(tab);
                    if (tab !== 'game') setActiveScreen(null);
                    if (tab === 'ranking') {
                      setRankCategory('イイ');
                    }
                  }}
                  feedSubMode={feedSubMode}
                  setFeedSubMode={setFeedSubMode}
                  latestThreadCount={latestThreadCount}
                  latestReplyCount={latestReplyCount}
                  mediaCount={mediaCount}
                />
              );
            })()}

            <div id="scrollable-content" className={`flex-1 scrollbar-none ${currentNav === 'home' && topTab === 'game' ? 'overflow-hidden flex flex-col pb-14' : 'overflow-y-auto pb-20'}`}>
              {currentNav === 'home' && topTab === 'game' && (
                <LiveGameView
                  userId={userId}
                  sessionId={ensureSessionId()}
                />
              )}
              {currentNav === 'home' && topTab !== 'game' && (
                <>
                  {topTab !== 'ranking' && topTab !== 'game' && (
                    <PostComposer
                      inline
                      userId={userId}
                      avatarUrl={currentUser?.avatarUrl}
                      bbsMode={bbsMode}
                      text={inputText}
                      setText={setInputText}
                      image={attachedImage}
                      setImage={setAttachedImage}
                      mml={attachedMml}
                      setMml={setAttachedMml}
                      gameDraft={gameDraft}
                      setGameDraft={setGameDraft}
                      originType={originType}
                      setOriginType={setOriginType}
                      onClose={() => {}}
                      onSubmit={handleCreatePost}
                      onOpenDrawing={() => { setCollabImageUrl(attachedImage || undefined); handleOpenEditor('drawing'); }}
                      onOpenDotDrawing={() => { setCollabImageUrl(attachedImage || undefined); handleOpenEditor('dotdrawing'); }}
                      onOpenMml={() => handleOpenEditor('mml')}
                      onOpenGameMaker={() => handleOpenEditor('gamemaker')}
                    />
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
                    feedSubMode={feedSubMode}
                    rankCategory={rankCategory}
                    bbsMode={bbsMode}
                    onLike={handleLike}
                    onDislike={handleDislike}
                    onRepost={handleRepost}
                    onHeart={handleHeart}
                    onAddReply={handleAddReply}
                    onQuickPost={handleQuickPost}
                    openGame={(gameId?: string, postId?: string) => {
                      if (gameId) handleOpenPostGame(gameId, postId);
                    }}
                    openCollab={handleOpenCollab}
                    openMml={() => setActiveScreen('mml')}
                    currentUserSlug={currentUser?.slug}
                    currentUserDisplayName={currentUser?.displayName}
                    onModerationChange={fetchPosts}
                    loading={loading}
                    onReplyClick={(post) => {
                      setReplyTargetPost(post);
                      setComposerOpen(true);
                    }}
                    onEditImage={handleEditPostImage}
                    onEditMml={handleEditPostMml}
                    onEditPost={handleEditPost}
                    userId={userId}
                  />
                </>
              )}

            </div>

            <BottomNav current={currentNav} set={handleNavigate} notifCount={notifCount} messageCount={messageCount} userAvatarUrl={currentUser?.avatarUrl} userSlug={currentUser?.slug} />

            <FAB openText={() => handleQuickPost()} />
          </>
        )}

        {composerOpen && (
          <PostComposer
            userId={userId}
            avatarUrl={currentUser?.avatarUrl}
            bbsMode={bbsMode}
            text={inputText}
            setText={setInputText}
            image={attachedImage}
            setImage={setAttachedImage}
            mml={attachedMml}
            setMml={setAttachedMml}
            gameDraft={gameDraft}
            setGameDraft={setGameDraft}
            originType={originType}
            setOriginType={setOriginType}
            onClose={() => { setComposerOpen(false); setReplyTargetPost(null); }}
            onSubmit={() => {
              if (replySubmittingRef.current) return;
              if (replyTargetPost) {
                handleCreateReplyFromComposer(replyTargetPost.id);
              } else {
                handleCreatePost();
              }
              setComposerOpen(false);
              setReplyTargetPost(null);
            }}
            onOpenDrawing={() => { setCollabImageUrl(attachedImage || undefined); handleOpenEditor('drawing'); }}
            onOpenDotDrawing={() => { setCollabImageUrl(attachedImage || undefined); handleOpenEditor('dotdrawing'); }}
            onOpenMml={() => handleOpenEditor('mml')}
            onOpenGameMaker={() => handleOpenEditor('gamemaker')}
            replyToDisplayName={replyTargetPost ? replyTargetPost.displayName : undefined}
          />
        )}

        {discardModalConfig && (
          <AttachmentDiscardModal
            onClose={() => setDiscardModalConfig(null)}
            onConfirm={handleConfirmDiscard}
            discardType={discardModalConfig.discardType}
          />
        )}

        {showGlobalEditModal && editingPost && (
          <EditPostModal
            initialContent={editingPost.content}
            originalContent={originalPostContent || editingPost.content}
            onClose={() => {
              setShowGlobalEditModal(false);
              setEditingPost(null);
              setOriginalPostContent('');
            }}
            onSave={async (newContent, nextImageSrc) => {
              const targetId = editingPost.id;
              const prevContent = editingPost.content;
              const prevImageSrc = editingPost.imageSrc;
              setShowGlobalEditModal(false);
              setEditingPost(null);
              setOriginalPostContent('');
              setPosts(prev => prev.map(p => p.id !== targetId ? p : {
                ...p,
                content: newContent,
                imageSrc: nextImageSrc === null ? undefined : (nextImageSrc ?? p.imageSrc),
                hasImage: nextImageSrc === null ? false : (nextImageSrc ? true : p.hasImage),
                isEdited: true,
              }));
              try {
                await api.posts.edit(targetId, userId, newContent, editingPost.originType, nextImageSrc === null ? '' : nextImageSrc);
                fetchPosts();
              } catch {
                setPosts(prev => prev.map(p => p.id !== targetId ? p : { ...p, content: prevContent, imageSrc: prevImageSrc }));
                showToast('error', '編集の保存に失敗しました');
              }
            }}
            imageSrc={editingPost.imageSrc}
            onEditImage={() => handleEditPostImage(editingPost)}
            onEditMml={() => handleEditPostMml(editingPost)}
            hasGame={editingPost.hasGame}
            gameTitle={editingPost.gameTitle}
            onEditGame={() => handleOpenPostGame(editingPost.gameId || '', editingPost.id)}
          />
        )}
        </div>
        <RightSidebar
          onSearch={(query) => {
            router.push(`/search?q=${encodeURIComponent(query)}`);
          }}
        />
      </div>
    </div>
  );
}
