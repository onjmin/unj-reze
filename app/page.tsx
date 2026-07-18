'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

import { Post, AnonymousUser, OriginType } from '@/lib/types';
import { api } from '@/lib/api';
import { decodeId } from '@/lib/sqids';
import { stripMmlLine } from '@/lib/mml';
import Header from '@/components/Header';
import EditPostModal from '@/components/EditPostModal';
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
import AttachmentDiscardModal from '@/components/AttachmentDiscardModal';

const DrawingEditor = dynamic(() => import('@/components/DrawingEditor'), { ssr: false });
const DotDrawingEditor = dynamic(() => import('@/components/DotDrawingEditor'), { ssr: false });
const MmlEditor = dynamic(() => import('@/components/MmlEditor'), { ssr: false });

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
  const [replyTargetPost, setReplyTargetPost] = useState<Post | null>(null);
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
  const [showGlobalEditModal, setShowGlobalEditModal] = useState(false);

  const heartQueue = useRef<Map<string, number>>(new Map());
  const heartTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const likeParity = useRef<Map<string, number>>(new Map());
  const likeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dislikeParity = useRef<Map<string, number>>(new Map());
  const dislikeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
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

  const handleProfileUpdate = useCallback((newDisplayName: string, newAvatarUrl?: string) => {
    setUserId(newDisplayName);
    if (currentUser) {
      const oldSlug = currentUser.slug;
      const oldDisplayName = currentUser.displayName;
      const updatedUser = {
        ...currentUser,
        displayName: newDisplayName,
        avatarUrl: newAvatarUrl,
      };
      setCurrentUser(updatedUser);
      localStorage.setItem('unj_current_user', JSON.stringify(updatedUser));

      const updatePost = (p: Post): Post => {
        const isUserPost = p.slug === oldSlug || p.displayName === oldDisplayName || p.displayName === newDisplayName;
        return {
          ...p,
          displayName: isUserPost ? newDisplayName : p.displayName,
          avatarUrl: isUserPost ? newAvatarUrl : p.avatarUrl,
          replies: p.replies?.map(r => {
            const isUserReply = r.slug === oldSlug || r.displayName === oldDisplayName || r.displayName === newDisplayName;
            return {
              ...r,
              displayName: isUserReply ? newDisplayName : r.displayName,
              avatarUrl: isUserReply ? newAvatarUrl : r.avatarUrl,
            };
          }) || [],
        };
      };

      setPosts(prev => prev.map(updatePost));
      setNewPosts(prev => prev.map(updatePost));
    }
  }, [currentUser]);

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

  const handleShowNewPosts = () => {
    setPosts(prev => [...newPosts, ...prev]);
    setNewPosts([]);
    document.getElementById('scrollable-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuickPost = (text?: string) => {
    setComposerOpen(true);
    if (text && typeof text === 'string') {
      setInputText(prev => prev ? `${prev} ${text} ` : `${text} `);
    }
  };

  const handleLike = (postId: string) => {
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

  const handleDislike = (postId: string) => {
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

  const handleRepost = async (postId: string) => {
    setPosts(prev => prev.map(p => p.id !== postId ? p : {
      ...p, reposted: !p.reposted,
      reposts: Math.max(0, p.reposted ? p.reposts - 1 : p.reposts + 1),
    }));
    const updated = await api.posts.repost(postId);
    setPosts(prev => prev.map(p => p.id === postId ? updated : p));
  };

  const handleHeart = (postId: string) => {
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

  const handleAddReply = async (postId: string, replyText: string) => {
    if (!replyText.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const optimisticReply: Post = {
      id: tempId, displayName: userId, createdAt: new Date().toISOString(), time: "たった今", content: replyText,
      likes: 0, dislikes: 0, liked: false, disliked: false,
      repliesCount: 0, reposts: 0, reposted: false,
      avatarColor: "from-blue-500 to-indigo-600",
      heartsTotal: 0, replies: [],
      threadId: postId, parentPostId: postId,
    };
    setPosts(prev => {
      const next = prev.map(p => p.id === postId
        ? { ...p, repliesCount: p.repliesCount + 1, replies: [...p.replies, optimisticReply] }
        : p);
      postsRef.current = next;
      return next;
    });
    try {
      const reply = await api.posts.replies.create(postId, {
        displayName: userId,
        content: replyText,
        parentPostId: postId,
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
    }
  };

  const handleCreateReplyFromComposer = async (postId: string) => {
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
  };

  const handleNavigate = (id: string) => {
    setCurrentNav(id);
    if (id === 'notifications') setNotifCount(0);
    if (id === 'messages') setMessageCount(0);
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

  const handleEditPost = (post: Post) => {
    setEditingPost(post);
    setShowGlobalEditModal(true);
  };

  const handleEditPostImage = (post: Post) => {
    setEditingPost(post);
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
          onClose={() => setActiveScreen(null)}
          onSave={handleSaveMml}
          initialMml={attachedMml || undefined}
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

      <div className="relative w-full max-w-2xl mx-auto border-x border-gray-800 h-dvh flex flex-col shrink-0">
        {!activeScreen && (
          <>
            <Header
              userId={userId}
              server={server}
              bbsMode={bbsMode}
              onOpenDrawer={() => setDrawerOpen(true)}
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
                  sessionId={getCookie('unj_reze_session') || userId}
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

              {currentNav === 'search' && (
                <SearchView
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
                  onEditImage={handleEditPostImage}
                  onEditMml={handleEditPostMml}
                  onEditPost={handleEditPost}
                />
              )}
              {currentNav === 'notifications' && <NotificationView userId={userId} />}
              {currentNav === 'messages' && <MessageView userId={userId} />}
              {currentNav === 'profile' && (
                <ProfileView
                  userId={userId}
                  displayName={currentUser?.displayName || userId}
                  currentUserId={userId}
                  currentUserSlug={currentUser?.slug}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  onHeart={handleHeart}
                  onRepost={handleRepost}
                  openCollab={handleOpenCollab}
                  onProfileUpdate={handleProfileUpdate}
                  onEditImage={handleEditPostImage}
                  onEditMml={handleEditPostMml}
                />
              )}
            </div>

            <BottomNav current={currentNav} set={handleNavigate} notifCount={notifCount} messageCount={messageCount} />

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
            onClose={() => {
              setShowGlobalEditModal(false);
              setEditingPost(null);
            }}
            onSave={async (newContent, nextImageSrc) => {
              try {
                await api.posts.edit(editingPost.id, userId, newContent, editingPost.originType, nextImageSrc === null ? '' : nextImageSrc);
                fetchPosts();
              } catch {}
              setShowGlobalEditModal(false);
              setEditingPost(null);
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
    </div>
  );
}
