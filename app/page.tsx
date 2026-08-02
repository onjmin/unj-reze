'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { Post, AnonymousUser, OriginType } from '@/lib/types';
import { api } from '@/lib/api';
import { usePostActions } from '@/lib/hooks/usePostActions';
import { useRealtimeSubscription, pollInterval } from '@/lib/hooks/useRealtime';
import { CH_FEED, chThread, chUser } from '@/lib/realtime/channels';
import { ensureSessionId } from '@/lib/session';
import { decodeId } from '@/lib/sqids';
import { stripMmlLine, extractMmlFromContent } from '@/lib/mml';
import Header from '@/components/Header';
import EditPostModal from '@/components/EditPostModal';
import TopTabs, { type FeedSubMode } from '@/components/TopTabs';
import dynamic from 'next/dynamic';
import RankingSubTabs from '@/components/RankingSubTabs';
import GameRankingView from '@/components/GameRankingView';
import FeedList from '@/components/FeedList';
import BottomNav from '@/components/BottomNav';
import LeftSidebar from '@/components/LeftSidebar';
import RightSidebar from '@/components/RightSidebar';
import FAB from '@/components/FAB';
import ScrollJumpControls from '@/components/ScrollJumpControls';
import CollabSelector from '@/components/CollabSelector';
import GameMaker, { type GameManifestDraft } from '@/components/GameMaker';
import LiveGameView from '@/components/LiveGameView';
import PostComposer from '@/components/PostComposer';
import AttachmentDiscardModal from '@/components/AttachmentDiscardModal';
import ToastContainer from '@/components/ToastContainer';
import HeartBurst from '@/components/HeartBurst';
import { showToast, triggerHeartBurst } from '@/lib/toast';
import { setRemixHandler, takeStashedRemix, setMvRemixHandler, takeStashedMvRemix, type RemixDraft, type MvRemixDraft } from '@/lib/remix';
import { countUnreadMessages, MESSAGES_READ_EVENT, NOTIFICATIONS_READ_EVENT } from '@/lib/read-state';
import type { MvManifest, MvPresetKind } from '@/lib/mv-config';

/** フィード1ページあたりのスレッド数。サーバー側の上限は50。 */
const FEED_PAGE_SIZE = 20;

const DrawingEditor = dynamic(() => import('@/components/DrawingEditor'), { ssr: false });
const DotDrawingEditor = dynamic(() => import('@/components/DotDrawingEditor'), { ssr: false });
const MmlEditor = dynamic(() => import('@/components/MmlEditor'), { ssr: false });
const MvMaker = dynamic(() => import('@/components/MvMaker'), { ssr: false });

export default function App() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPosts, setNewPosts] = useState<Post[]>([]);
  const postsRef = useRef<Post[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /** 連打・多重発火の抑止（state だと同一tick内で追いつかない） */
  const loadingMoreRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [currentNav, setCurrentNav] = useState('home');
  const [topTab, setTopTab] = useState('everyone');
  const [feedSubMode, setFeedSubMode] = useState<FeedSubMode>('threads');
  const [rankCategory, setRankCategory] = useState('イイ');
  /** ホームタブの「最新スレ/最新レス」バッジ用。直近24時間の投稿数を posts が変わるたびに数え直す。
   *  Date.now() は不純関数のためレンダー中には呼べず、effect 側で算出して state へ反映する。 */
  const [latestCounts, setLatestCounts] = useState({ latestThreadCount: 0, latestReplyCount: 0, mediaCount: 0 });
  useEffect(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentPosts = posts.filter(p => new Date(p.createdAt).getTime() >= dayAgo);
    const next = {
      latestThreadCount: recentPosts.length,
      latestReplyCount: recentPosts.reduce((sum, p) => sum + p.repliesCount, 0),
      mediaCount: posts.filter(p => p.hasImage).length,
    };
    Promise.resolve().then(() => setLatestCounts(next));
  }, [posts]);
  const { latestThreadCount, latestReplyCount, mediaCount } = latestCounts;
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
    Promise.resolve().then(() => { if (saved) setBbsModeRaw(saved); });

    try {
      const cached = localStorage.getItem('unj_current_user');
      if (cached) Promise.resolve().then(() => setCurrentUser(JSON.parse(cached)));
    } catch {}

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);

      // ?tab=game のように上部タブを直接指定して開けるようにする。
      // PWA のショートカットやライブゲームへの導線から使う。
      const tab = params.get('tab');
      if (tab && ['everyone', 'following', 'ranking', 'game'].includes(tab)) {
        Promise.resolve().then(() => {
          setTopTab(tab);
          if (tab === 'ranking') setRankCategory('イイ');
        });
      }
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
  const [mvDraft, setMvDraft] = useState<{ manifest: MvManifest; title: string; preset: MvPresetKind } | null>(null);
  const [playingGame, setPlayingGame] = useState<{ manifest: GameManifestDraft; title: string; postId?: string; gameId?: string; creatorSlug?: string } | null>(null);
  const [playingMv, setPlayingMv] = useState<{ manifest: MvManifest; title: string; preset: MvPresetKind; postId?: string; mvId?: string; creatorSlug?: string } | null>(null);
  const [postGameDanmaku, setPostGameDanmaku] = useState<string[]>([]);
  const postGameLastIdRef = useRef(0);
  const [discardModalConfig, setDiscardModalConfig] = useState<{
    discardType: 'image' | 'mml' | 'game' | 'mv';
    targetScreen: 'drawing' | 'dotdrawing' | 'mml' | 'gamemaker' | 'mvmaker';
  } | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [originalPostContent, setOriginalPostContent] = useState<string>('');
  const [showGlobalEditModal, setShowGlobalEditModal] = useState(false);

  /** エディタ（お絵描き/ドット絵/MML/ゲーム）を開くためにコンポーザを閉じたか。
   *  返信コンポーザからエディタへ移ると `replyTargetPost` だけが残り、
   *  保存後にコンポーザを開き直さないとフィードのインラインコンポーザから
   *  「通常投稿」として送信されてしまう（返信先が失われる）。
   *  復帰の要否をここで覚えておき、エディタを閉じるときに戻す。 */
  const composerReturnRef = useRef(false);

  /** 全画面エディタを開く。`fromComposer` のときだけ閉じ際にコンポーザへ復帰する。 */
  const openScreen = useCallback((screen: string, fromComposer = false) => {
    composerReturnRef.current = fromComposer;
    setComposerOpen(false);
    setActiveScreen(screen);
  }, []);

  /** 全画面エディタを閉じる。コンポーザ由来なら返信先を保ったまま開き直す。 */
  const closeScreen = useCallback(() => {
    setActiveScreen(null);
    if (composerReturnRef.current) {
      composerReturnRef.current = false;
      setComposerOpen(true);
    }
  }, []);

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
        setMessageCount(countUnreadMessages(msgs, user.displayName));
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
            postsRef.current = parsed;
            Promise.resolve().then(() => {
              setPosts(parsed);
              setLoading(false);
            });
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

  const postGameActive = activeScreen === 'postgame' && !!playingGame?.postId;

  // 実況コメントはハブからの push で流す。ハブ未設定のときだけ従来のポーリングに落ちる。
  useRealtimeSubscription(
    postGameActive && playingGame?.postId ? [chThread(playingGame.postId)] : [],
    useCallback((msg) => {
      if (msg.t !== 'event' || msg.event !== 'reply.created') return;
      const r = msg.data as Post;
      const rid = decodeId(r.id) || 0;
      if (rid <= postGameLastIdRef.current) return;
      postGameLastIdRef.current = rid;
      setPostGameDanmaku(prev => [...prev, `${r.displayName}: ${r.content}`]);
    }, []),
    postGameActive
  );

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
    // ハブがあれば初回の1回だけ。取りこぼし対策の保険として長い間隔で回す。
    const id = setInterval(poll, pollInterval(3000, 120000));
    return () => clearInterval(id);
  }, [activeScreen, playingGame?.postId]);

  const fetchPosts = useCallback(async () => {
    try {
      const data = await api.posts.list(userId, { limit: FEED_PAGE_SIZE });
      setPosts(data);
      postsRef.current = data;
      // 満載で返ってきたなら、まだ先がある可能性が高い
      setHasMorePosts(data.length >= FEED_PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * 続きを読み込む。表示中で最も古いスレッドのIDをカーソルにする（キーセットページング）。
   * OFFSET だと読み込み中に新規投稿が入った際に境界がずれて重複・取りこぼしが起きる。
   */
  const loadMorePosts = useCallback(async () => {
    if (loadingMoreRef.current || !hasMorePosts) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      let cursor: Post | null = null;
      let minId = Number.POSITIVE_INFINITY;
      for (const p of postsRef.current) {
        const n = decodeId(p.id) || 0;
        if (n > 0 && n < minId) { minId = n; cursor = p; }
      }
      if (!cursor) { setHasMorePosts(false); return; }

      const older = await api.posts.list(userId, { beforeId: cursor.id, limit: FEED_PAGE_SIZE });
      setPosts(prev => {
        const seen = new Set(prev.map(p => String(p.id)));
        const merged = [...prev, ...older.filter(p => !seen.has(String(p.id)))];
        postsRef.current = merged;
        return merged;
      });
      setHasMorePosts(older.length >= FEED_PAGE_SIZE);
    } catch {
      // 失敗しても次のタップで再試行できるようにするだけ
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [userId, hasMorePosts]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  /** 新着候補を「まだ表示していないもの」だけ積む。push とポーリング双方から呼ぶ。 */
  const pushNewPosts = useCallback((incoming: Post[]) => {
    if (incoming.length === 0) return;
    const existingIds = new Set(postsRef.current.map(p => String(p.id)));
    setNewPosts(current => {
      const seen = new Set(current.map(p => String(p.id)));
      const fresh = incoming.filter(p => !existingIds.has(String(p.id)) && !seen.has(String(p.id)));
      return fresh.length > 0 ? [...fresh, ...current] : current;
    });
  }, []);

  // 新着投稿はハブから丸ごと届くので、確認のためだけの再取得は要らない。
  useRealtimeSubscription(
    userId ? [CH_FEED] : [],
    useCallback((msg) => {
      if (msg.t !== 'event' || msg.event !== 'post.created') return;
      pushNewPosts([msg.data as Post]);
    }, [pushNewPosts]),
    !!userId
  );

  useEffect(() => {
    if (!userId) return;
    // ハブ設定時は「接続が切れていた間の取りこぼし」を拾う保険だけ。
    const intervalId = setInterval(async () => {
      try {
        pushNewPosts(await api.posts.list(userId));
      } catch {
        // ignore errors
      }
    }, pollInterval(15000, 300000));

    return () => clearInterval(intervalId);
  }, [userId, pushNewPosts]);

  // 通知一覧の差分で「フォローされた」「いいね／ハートされた」を検知し、Snackbar と
  // ハート受信演出を出す。初回は既存通知を seen に登録するだけでトーストは出さない
  // （履歴を新着として誤検知しないため）。以降は未見のIDだけをトースト＆Setサイズを上限で刈り込む。
  //
  // ハブ設定時は「1件届いた」という push を受けたときだけ取りに行く。
  // 通知の中身は push に載せていないので、ここは常に自分の通知一覧を引く経路のまま。
  const seenNotifIds = useRef<Set<string> | null>(null);
  const notifCancelledRef = useRef(false);

  const refreshNotifications = useCallback(async (uid: string) => {
    try {
      const notifs = await api.notifications.list(uid);
      if (notifCancelledRef.current) return;
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
      // ignore fetch errors
    }
  }, []);

  useRealtimeSubscription(
    userId ? [chUser(userId)] : [],
    useCallback((msg) => {
      if (msg.t !== 'event' || msg.event !== 'notify') return;
      if (userId) void refreshNotifications(userId);
    }, [userId, refreshNotifications]),
    !!userId
  );

  useEffect(() => {
    if (!userId) return;
    notifCancelledRef.current = false;
    Promise.resolve().then(() => refreshNotifications(userId));
    // ハブ設定時は push が主。ここは取りこぼし用の保険。
    const id = setInterval(() => { void refreshNotifications(userId); }, pollInterval(20000, 300000));
    return () => { notifCancelledRef.current = true; clearInterval(id); };
  }, [userId, refreshNotifications]);

  // メッセージ／通知が既読になったらバッジを即座に落とす。
  useEffect(() => {
    const clearMessages = () => setMessageCount(0);
    const clearNotifs = () => setNotifCount(0);
    window.addEventListener(MESSAGES_READ_EVENT, clearMessages);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, clearNotifs);
    return () => {
      window.removeEventListener(MESSAGES_READ_EVENT, clearMessages);
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, clearNotifs);
    };
  }, []);

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
      hasMv: !!mvDraft,
      mvTitle: mvDraft?.title,
      hasGame: !!gameDraft,
      gameTitle: gameDraft?.title,
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
    setMvDraft(null);
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
      let mvId: number | undefined;
      if (mvDraft) {
        const res = await fetch('/api/mvs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset: mvDraft.preset, title: mvDraft.title, manifest: mvDraft.manifest, creatorSlug: currentUser?.slug }),
        });
        if (res.ok) {
          const savedMv = await res.json();
          mvId = savedMv.id;
        }
      }

      const reply = await api.posts.replies.create(postId, {
        displayName: userId,
        content,
        parentPostId: postId,
        hasImage: !!attachedImage,
        imageSrc,
        gameId,
        mvId,
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
    // ゲーム/MVだけ添付してコメントを消した場合も投稿できるようにする（送信ボタンの活性条件と揃える）
    if (!inputText.trim() && !attachedImage && !attachedMml && !gameDraft && !mvDraft) return;
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
      hasMv: !!mvDraft,
      mvTitle: mvDraft?.title,
      hasGame: !!gameDraft,
      gameTitle: gameDraft?.title,
      originType,
    };
    setPosts(prev => { const next = [optimisticPost, ...prev]; postsRef.current = next; return next; });
    setInputText('');
    setAttachedImage(null);
    setAttachedMml(null);
    setGameDraft(null);
    setMvDraft(null);
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
      let mvId: string | undefined;
      if (mvDraft) {
        const res = await fetch('/api/mvs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset: mvDraft.preset, title: mvDraft.title, manifest: mvDraft.manifest, creatorSlug: currentUser?.slug }),
        });
        if (res.ok) {
          const savedMv = await res.json();
          mvId = savedMv.id;
        }
      }
      const post = await api.posts.create({
        displayName: userId,
        content,
        hasImage: !!attachedImage,
        imageSrc,
        avatarColor: "from-blue-500 to-indigo-600",
        gameId,
        mvId,
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
      openScreen('mml');
      return;
    }
    setCollabImageUrl(post.imageSrc);
    setShowCollabSelector(true);
  }, [openScreen]);

  const handleCollabSelectDrawing = useCallback(() => {
    setShowCollabSelector(false);
    openScreen('drawing');
  }, [openScreen]);

  const handleCollabSelectDotDrawing = useCallback(() => {
    setShowCollabSelector(false);
    openScreen('dotdrawing');
  }, [openScreen]);

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
      openScreen('dotdrawing');
    } else {
      openScreen('drawing');
    }
  };

  const handleEditPostMml = (post: Post) => {
    setEditingPost(post);
    setOriginalPostContent(prev => prev || post.content);
    setShowGlobalEditModal(false);
    openScreen('mml');
  };

  const handleEditPostMv = async (post: Post) => {
    setEditingPost(post);
    setOriginalPostContent(prev => prev || post.content);
    setShowGlobalEditModal(false);
    if (post.mvId) {
      try {
        const res = await fetch(`/api/mvs/${post.mvId}`);
        if (!res.ok) return;
        const mv = await res.json();
        setPlayingMv({ manifest: mv.manifest, title: mv.title, preset: mv.preset, postId: post.id, mvId: post.mvId, creatorSlug: mv.creatorSlug });
        openScreen('mvmaker');
      } catch {}
    }
  };

  const handleSaveDrawing = async (canvasData: string) => {
    if (editingPost) {
      setEditingPost(prev => prev ? { ...prev, imageSrc: canvasData } : null);
      closeScreen();
      setCollabImageUrl(undefined);
      setShowGlobalEditModal(true);
      return;
    }
    setAttachedImage(canvasData);
    closeScreen();
    setCollabImageUrl(undefined);
    setInputText("#お絵描き 自作イラスト完成！");
  };

  const handleSaveDotDrawing = async (canvasData: string) => {
    if (editingPost) {
      setEditingPost(prev => prev ? { ...prev, imageSrc: canvasData } : null);
      closeScreen();
      setCollabImageUrl(undefined);
      setShowGlobalEditModal(true);
      return;
    }
    setAttachedImage(canvasData);
    closeScreen();
    setCollabImageUrl(undefined);
    setInputText("#ドット絵 自作ドット絵完成！");
  };

  const handleSaveMml = async (mml: string) => {
    if (editingPost) {
      const stripped = stripMmlLine(editingPost.content);
      const newContent = `${stripped}\n#mml ${mml}`.trim();
      setEditingPost(prev => prev ? { ...prev, content: newContent } : null);
      closeScreen();
      setShowGlobalEditModal(true);
      return;
    }
    closeScreen();
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
      openScreen('postgame');
    } catch {}
  };

  const [pendingReturnTo, setPendingReturnTo] = useState<string | null>(null);

  // URL の ?mention= と、ゲーム→投稿フローから復帰した際の sessionStorage 保留情報を処理する。
  // handleQuickPost/handleOpenPostGame/setPendingReturnTo の宣言後に置くための専用effect。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const mention = params.get('mention');
    if (mention) {
      Promise.resolve().then(() => handleQuickPost(`@${mention}`));
      window.history.replaceState({}, '', window.location.pathname);
    }
    try {
      const pending = sessionStorage.getItem('unj_pending_game');
      if (pending) {
        sessionStorage.removeItem('unj_pending_game');
        const { gameId, postId, returnTo } = JSON.parse(pending);
        Promise.resolve().then(() => {
          if (returnTo) setPendingReturnTo(returnTo);
          if (gameId) handleOpenPostGame(gameId, postId);
        });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveEditedGame = async (manifest: GameManifestDraft, meta: { title: string; preset: string }) => {
    if (!playingGame?.gameId) return;
    try {
      await fetch(`/api/games/${playingGame.gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: meta.title, manifest, userSlug: currentUser?.slug }),
      });
    } catch {}
    closeScreen();
    setPlayingGame(null);
    setPostGameDanmaku([]);
    if (editingPost) {
      setShowGlobalEditModal(true);
    }
  };

  const handleSaveEditedMv = async (data: { manifest: MvManifest; title: string; preset: MvPresetKind }) => {
    if (!playingMv?.mvId) return;
    try {
      await fetch(`/api/mvs/${playingMv.mvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: data.title, manifest: data.manifest, userSlug: currentUser?.slug }),
      });
    } catch {}
    closeScreen();
    setPlayingMv(null);
    if (editingPost) {
      setShowGlobalEditModal(true);
    }
  };

  const handleSaveGame = (manifest: GameManifestDraft, meta: { title: string; preset: string }) => {
    setGameDraft({ manifest, title: meta.title, preset: meta.preset });
    closeScreen();
    setInputText((prev) => prev.trim() ? prev : `#ゲーム 「${meta.title}」を作ったよ！`);
  };

  const handleSaveMv = (data: { manifest: MvManifest; title: string; preset: MvPresetKind }) => {
    setMvDraft(data);
    closeScreen();
    setInputText((prev) => prev.trim() ? prev : `#MV 「${data.title}」を作ったよ！`);
  };

  /**
   * 他人のゲームを「改造する」で受け取ったときの処理。
   * 下書きに取り込んだうえでエディタを開き、そのまま手を入れられる状態にする。
   * 元ネタは自作ではないので権利表記は「not自作 & 改変OK」を初期値にしておく。
   */
  const handleRemixDraft = useCallback((draft: RemixDraft) => {
    setPlayingGame(null);
    setPostGameDanmaku([]);
    setGameDraft({ manifest: draft.manifest, title: draft.title, preset: draft.preset });
    setOriginType('others_modify_ok');
    setInputText(prev => prev.trim()
      ? prev
      : `#ゲーム 「${draft.sourceTitle || '元ゲーム'}」を改造したよ！`);
    composerReturnRef.current = false;
    setComposerOpen(false);
    setActiveScreen('gamemaker');
    showToast('success', '下書きに取り込んだよ。好きに改造してね');
  }, []);

  const handleMvRemixDraft = useCallback((draft: MvRemixDraft) => {
    setMvDraft({ manifest: draft.manifest, title: draft.title, preset: draft.preset });
    setOriginType('others_modify_ok');
    setInputText(prev => prev.trim()
      ? prev
      : `#MV 「${draft.sourceTitle || '元MV'}」を改造したよ！`);
    composerReturnRef.current = false;
    setComposerOpen(false);
    setActiveScreen('mvmaker');
    showToast('success', '下書きに取り込んだよ。好きに改造してね');
  }, []);

  useEffect(() => {
    const disposeGame = setRemixHandler(handleRemixDraft);
    const disposeMv = setMvRemixHandler(handleMvRemixDraft);

    const stashedGame = takeStashedRemix();
    const stashedMv = takeStashedMvRemix();

    const timerGame = stashedGame ? setTimeout(() => handleRemixDraft(stashedGame), 0) : null;
    const timerMv = stashedMv ? setTimeout(() => handleMvRemixDraft(stashedMv), 0) : null;

    return () => {
      if (timerGame) clearTimeout(timerGame);
      if (timerMv) clearTimeout(timerMv);
      disposeGame();
      disposeMv();
    };
  }, [handleRemixDraft, handleMvRemixDraft]);

  const handleOpenEditor = (screenType: 'drawing' | 'dotdrawing' | 'mml' | 'gamemaker' | 'mvmaker') => {
    const hasImage = !!attachedImage;
    const hasMml = !!attachedMml;
    const hasGame = !!gameDraft;
    const hasMv = !!mvDraft;

    if (screenType === 'drawing' || screenType === 'dotdrawing') {
      if (hasMml) {
        setDiscardModalConfig({ discardType: 'mml', targetScreen: screenType });
        return;
      }
      if (hasGame) {
        setDiscardModalConfig({ discardType: 'game', targetScreen: screenType });
        return;
      }
      if (hasMv) {
        setDiscardModalConfig({ discardType: 'mv', targetScreen: screenType });
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
      if (hasMv) {
        setDiscardModalConfig({ discardType: 'mv', targetScreen: screenType });
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
      if (hasMv) {
        setDiscardModalConfig({ discardType: 'mv', targetScreen: screenType });
        return;
      }
    } else if (screenType === 'mvmaker') {
      if (hasImage) {
        setDiscardModalConfig({ discardType: 'image', targetScreen: screenType });
        return;
      }
      if (hasMml) {
        setDiscardModalConfig({ discardType: 'mml', targetScreen: screenType });
        return;
      }
      if (hasGame) {
        setDiscardModalConfig({ discardType: 'game', targetScreen: screenType });
        return;
      }
    }

    // 返信コンポーザから来た場合は、保存/キャンセル後にコンポーザ（＝返信先）へ戻す
    openScreen(screenType, composerOpen);
  };

  const handleConfirmDiscard = () => {
    if (!discardModalConfig) return;
    const { discardType, targetScreen } = discardModalConfig;

    if (discardType === 'image') setAttachedImage(null);
    if (discardType === 'mml') setAttachedMml(null);
    if (discardType === 'game') setGameDraft(null);
    if (discardType === 'mv') setMvDraft(null);

    openScreen(targetScreen, composerOpen);
    setDiscardModalConfig(null);
  };

  return (
    <div className="bg-[#0b0e14] text-gray-100 min-h-screen w-full flex flex-col select-none font-sans relative">
      <ToastContainer />
      <HeartBurst />

      {activeScreen === 'drawing' && (
        <DrawingEditor
          onClose={() => { closeScreen(); setCollabImageUrl(undefined); }}
          onSave={handleSaveDrawing}
          collabImageUrl={collabImageUrl}
        />
      )}
      {activeScreen === 'dotdrawing' && (
        <DotDrawingEditor
          onClose={() => { closeScreen(); setCollabImageUrl(undefined); }}
          onSave={handleSaveDotDrawing}
          collabImageUrl={collabImageUrl}
        />
      )}
      {activeScreen === 'gamemaker' && (
        <GameMaker onClose={closeScreen} userId={userId} onSave={handleSaveGame} initialManifest={gameDraft?.manifest} />
      )}
      {activeScreen === 'mvmaker' && (
        <MvMaker
          onClose={() => {
            closeScreen();
            setPlayingMv(null);
            if (editingPost) setShowGlobalEditModal(true);
          }}
          userId={userId}
          onSave={editingPost && !!currentUser?.slug && playingMv?.creatorSlug === currentUser.slug ? handleSaveEditedMv : handleSaveMv}
          initialManifest={playingMv?.manifest || mvDraft?.manifest}
          isEditing={!!playingMv || !!mvDraft}
        />
      )}
      {activeScreen === 'postgame' && playingGame && (
        <GameMaker
          onClose={() => {
            closeScreen();
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
          gameId={playingGame.gameId}
          onRemix={(manifest, meta) => handleRemixDraft({
            manifest,
            title: meta.title,
            preset: meta.preset,
            sourceGameId: playingGame.gameId,
            sourceTitle: playingGame.title,
          })}
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
            closeScreen();
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

      <div className="w-full min-h-screen flex justify-center bg-[#0b0e14]" onWheel={handleOuterWheel}>
        <LeftSidebar
          current={currentNav}
          set={handleNavigate}
          notifCount={notifCount}
          messageCount={messageCount}
          userAvatarUrl={currentUser?.avatarUrl}
          userSlug={currentUser?.slug}
          onPost={() => handleQuickPost()}
        />
        <div className="relative w-full max-w-2xl border-x border-gray-800 flex flex-col shrink-0">
        {!activeScreen && (
          <>
            <Header
              userId={userId}
              server={server}
              bbsMode={bbsMode}
              onOpenSettings={() => router.push('/settings')}
              onToggleBbsMode={() => setBbsMode(bbsMode === '掲示板モード' ? 'SNSモード' : '掲示板モード')}
            />

            {currentNav === 'home' && (
              <TopTabs
                activeTab={topTab}
                setActiveTab={(tab) => {
                  setTopTab(tab);
                  if (tab !== 'game') { composerReturnRef.current = false; setActiveScreen(null); }
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
            )}

            <div id="scrollable-content" className={`flex-1 scrollbar-none ${currentNav === 'home' && topTab === 'game' ? 'overflow-hidden flex flex-col pb-14' : 'pb-20'}`}>
              {currentNav === 'home' && topTab === 'game' && (
                <LiveGameView
                  userId={userId}
                  sessionId={ensureSessionId()}
                />
              )}
              {currentNav === 'home' && topTab !== 'game' && (
                <>
                  {/* 掲示板モードでは板＝スレ一覧を最初に見せる（投稿は「スレ作成」からモーダルで） */}
                  {topTab !== 'ranking' && topTab !== 'game' && bbsMode !== '掲示板モード' && (
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
                      mvDraft={mvDraft}
                      setMvDraft={setMvDraft}
                      originType={originType}
                      setOriginType={setOriginType}
                      onClose={() => {}}
                      onSubmit={handleCreatePost}
                      onOpenDrawing={() => { setCollabImageUrl(attachedImage || undefined); handleOpenEditor('drawing'); }}
                      onOpenDotDrawing={() => { setCollabImageUrl(attachedImage || undefined); handleOpenEditor('dotdrawing'); }}
                      onOpenMml={() => handleOpenEditor('mml')}
                      onOpenGameMaker={() => handleOpenEditor('gamemaker')}
                      onOpenMvMaker={() => handleOpenEditor('mvmaker')}
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

                  {/* ゲームランキングは投稿ではなくゲームを並べるので FeedList を通さない */}
                  {topTab === 'ranking' && rankCategory === 'ゲーム' ? (
                  <GameRankingView />
                  ) : (
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
                    openMml={() => openScreen('mml')}
                    currentUserSlug={currentUser?.slug}
                    currentUserDisplayName={currentUser?.displayName}
                    onModerationChange={fetchPosts}
                    loading={loading}
                    onLoadMore={loadMorePosts}
                    hasMore={hasMorePosts}
                    loadingMore={loadingMore}
                    onReplyClick={(post) => {
                      setReplyTargetPost(post);
                      setComposerOpen(true);
                    }}
                    onEditImage={handleEditPostImage}
                    onEditMml={handleEditPostMml}
                    onEditMv={handleEditPostMv}
                    onEditPost={handleEditPost}
                    userId={userId}
                  />
                  )}
                </>
              )}

            </div>

            <BottomNav current={currentNav} set={handleNavigate} notifCount={notifCount} messageCount={messageCount} userAvatarUrl={currentUser?.avatarUrl} userSlug={currentUser?.slug} />

            <FAB openText={() => handleQuickPost()} />

            <ScrollJumpControls />
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
            mvDraft={mvDraft}
            setMvDraft={setMvDraft}
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
            onOpenMvMaker={() => handleOpenEditor('mvmaker')}
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
            hasMv={editingPost.hasMv}
            mvTitle={editingPost.mvTitle}
            onEditMv={() => handleEditPostMv(editingPost)}
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
