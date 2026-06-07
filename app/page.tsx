'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Menu, Timer, Search, PlaySquare, MessageCircle, Repeat, Heart,
  Home, Bell, Mail, User, Plus, X, Pen, Eraser, Minus, Triangle,
  PaintBucket, Type, Layers, Trash2, Undo, Redo, Edit3, MoreHorizontal,
  Settings, Check, ThumbsUp, ThumbsDown
} from 'lucide-react';

interface Reply {
  id: number;
  name: string;
  content: string;
  time: string;
}

interface Post {
  id: number;
  name: string;
  time: string;
  content: string;
  likes: number;
  dislikes: number;
  liked: boolean;
  disliked: boolean;
  repliesCount: number;
  reposts: number;
  reposted: boolean;
  hasImage?: boolean;
  imageSrc?: string;
  imageAlt?: string;
  avatarColor: string;
  hasCollabButton?: boolean;
  heartsTotal: number;
  hasGame?: boolean;
  replies: Reply[];
}

const INITIAL_POSTS: Post[] = [
  {
    id: 1,
    name: "名無しvpS",
    time: "22時間前",
    content: "#お絵描き\nねるネルねるね",
    likes: 25,
    dislikes: 1,
    liked: false,
    disliked: false,
    repliesCount: 8,
    reposts: 2,
    reposted: false,
    hasImage: true,
    imageSrc: "image_58ab6f.png",
    imageAlt: "ねるネルねるねの金髪少女イラスト",
    avatarColor: "from-emerald-500 to-green-600",
    hasCollabButton: true,
    heartsTotal: 1057,
    replies: [
      { id: 101, name: "名無しA", content: "かわいい！", time: "20時間前" }
    ]
  },
  {
    id: 2,
    name: "名無しe8H",
    time: "21時間前",
    content: "#お絵描き\nお絵かきツール 味に使い辛い...",
    likes: 24,
    dislikes: 2,
    liked: false,
    disliked: false,
    repliesCount: 14,
    reposts: 1,
    reposted: false,
    hasImage: true,
    imageSrc: "image_58ab6f.png",
    imageAlt: "味に使い辛いお絵かきツール紹介スケッチ",
    avatarColor: "from-blue-600 to-indigo-700",
    hasCollabButton: true,
    heartsTotal: 840,
    replies: []
  },
  {
    id: 3,
    name: "名無しmpz",
    time: "たった今",
    content: "さとるに限った話ではないけど人間ってある程度歳行くと目つきの攻撃性落ちるよな",
    likes: 3,
    dislikes: 1,
    liked: false,
    disliked: false,
    repliesCount: 8,
    reposts: 2,
    reposted: false,
    hasImage: true,
    imageSrc: "image_58b311.jpg",
    imageAlt: "さとるのビフォーアフター写真",
    avatarColor: "from-indigo-500 to-purple-600",
    hasCollabButton: true,
    heartsTotal: 12,
    replies: [
      {
        id: 102,
        name: "名無しLeuy",
        content: "肌のハリがね... 中学生とかハリが良過ぎな上に反抗期でメンタルも攻撃的だから...",
        time: "2分前"
      }
    ]
  },
  {
    id: 4,
    name: "名無しdbF",
    time: "7時間前",
    content: "#お絵描き\nキョン！風呂に行くわよ！！",
    likes: 2,
    dislikes: 0,
    liked: false,
    disliked: false,
    repliesCount: 26,
    reposts: 0,
    reposted: false,
    hasImage: true,
    imageSrc: "image_58b2e9.png",
    imageAlt: "キョン！風呂に行くわよ！！のラフ画",
    avatarColor: "from-amber-400 to-orange-500",
    hasCollabButton: true,
    heartsTotal: 256,
    replies: []
  },
  {
    id: 5,
    name: "名無し7ui",
    time: "22時間前",
    content: "対立煽りは、無視しよう",
    likes: 8,
    dislikes: 0,
    liked: false,
    disliked: false,
    repliesCount: 23,
    reposts: 1,
    reposted: false,
    avatarColor: "from-blue-400 to-cyan-500",
    heartsTotal: 5,
    replies: []
  }
];

export default function App() {
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [currentNav, setCurrentNav] = useState('home');
  const [topTab, setTopTab] = useState('everyone');
  const [rankCategory, setRankCategory] = useState('イイ');
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userId, setUserId] = useState('名無しvFZ');
  const [server, setServer] = useState('/main');
  const [bbsMode, setBbsMode] = useState('掲示板モード');
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);

  const handleLike = (postId: number) => {
    setPosts(posts.map(p => {
      if (p.id === postId) {
        const liked = !p.liked;
        return {
          ...p,
          liked,
          likes: liked ? p.likes + 1 : p.likes - 1,
          disliked: liked ? false : p.disliked,
          dislikes: (liked && p.disliked) ? p.dislikes - 1 : p.dislikes
        };
      }
      return p;
    }));
  };

  const handleDislike = (postId: number) => {
    setPosts(posts.map(p => {
      if (p.id === postId) {
        const disliked = !p.disliked;
        return {
          ...p,
          disliked,
          dislikes: disliked ? p.dislikes + 1 : p.dislikes - 1,
          liked: disliked ? false : p.liked,
          likes: (disliked && p.liked) ? p.likes - 1 : p.likes
        };
      }
      return p;
    }));
  };

  const handleRepost = (postId: number) => {
    setPosts(posts.map(p => {
      if (p.id === postId) {
        const reposted = !p.reposted;
        return {
          ...p,
          reposted,
          reposts: reposted ? p.reposts + 1 : p.reposts - 1
        };
      }
      return p;
    }));
  };

  const handleAddReply = (postId: number, replyText: string) => {
    if (!replyText.trim()) return;
    setPosts(posts.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          repliesCount: p.repliesCount + 1,
          replies: [
            ...p.replies,
            { id: Date.now(), name: userId, content: replyText, time: "たった今" }
          ]
        };
      }
      return p;
    }));
  };

  const handleCreatePost = () => {
    if (!inputText.trim() && !attachedImage) return;
    const newPost: Post = {
      id: Date.now(),
      name: userId,
      time: "たった今",
      content: inputText,
      likes: 0,
      dislikes: 0,
      liked: false,
      disliked: false,
      repliesCount: 0,
      reposts: 0,
      reposted: false,
      hasImage: !!attachedImage,
      imageSrc: attachedImage || undefined,
      avatarColor: "from-blue-500 to-indigo-600",
      hasCollabButton: true,
      heartsTotal: 0,
      replies: []
    };
    setPosts([newPost, ...posts]);
    setInputText('');
    setAttachedImage(null);
  };

  const handleSaveDrawing = (canvasData: string) => {
    setAttachedImage(canvasData);
    setActiveScreen(null);
    setInputText("#お絵描き 自作イラスト完成！");
  };

  return (
    <div className="bg-[#0b0e14] text-gray-100 h-screen w-full flex flex-col overflow-hidden select-none font-sans relative sm:max-w-md sm:mx-auto sm:border-x sm:border-gray-800 shadow-2xl">
      <RightDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userId={userId}
        setUserId={setUserId}
        server={server}
        setServer={setServer}
        bbsMode={bbsMode}
        setBbsMode={setBbsMode}
      />

      {activeScreen === 'drawing' && (
        <DrawingEditor
          onClose={() => setActiveScreen(null)}
          onSave={handleSaveDrawing}
        />
      )}
      {activeScreen === 'game' && (
        <GamePlayer
          onClose={() => setActiveScreen(null)}
          onPostScore={(score) => {
            setInputText(`🎮『さとるのちんぽ escape』で ${score} 点を獲得したぞ！ #ゲーム`);
            setActiveScreen(null);
          }}
        />
      )}

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
                          onClick={() => setActiveScreen('drawing')}
                          className="p-2 hover:bg-gray-100/10 rounded-full hover:text-[#a3e635] transition-colors"
                          title="イラストを描く"
                        >
                          <Pen size={18} />
                        </button>
                        <button
                          onClick={() => setActiveScreen('game')}
                          className="p-2 hover:bg-gray-100/10 rounded-full hover:text-purple-400 transition-colors"
                          title="ゲームを起動"
                        >
                          <PlaySquare size={18} />
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
                  onAddReply={handleAddReply}
                  openGame={() => setActiveScreen('game')}
                  openDrawing={() => setActiveScreen('drawing')}
                />
              </>
            )}

            {currentNav === 'search' && <SearchView />}
            {currentNav === 'notifications' && <NotificationView />}
            {currentNav === 'messages' && <MessageView />}
            {currentNav === 'profile' && <ProfileView userId={userId} posts={posts} />}
          </div>

          <BottomNav current={currentNav} set={setCurrentNav} />

          <FAB
            open={fabOpen}
            setOpen={setFabOpen}
            openDrawing={() => { setFabOpen(false); setActiveScreen('drawing'); }}
            openGame={() => { setFabOpen(false); setActiveScreen('game'); }}
            openText={() => { setFabOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          />
        </>
      )}
    </div>
  );
}

interface HeaderProps {
  userId: string;
  server: string;
  bbsMode: string;
  onOpenDrawer: () => void;
}

const Header = ({ userId, server, bbsMode, onOpenDrawer }: HeaderProps) => {
  const [currentTime, setCurrentTime] = useState('02:03:04');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setCurrentTime(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex flex-col border-b border-gray-800 px-3 py-2 shrink-0 bg-[#0b0e14]/90 backdrop-blur z-20">
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center space-x-2">
          <span className="text-[#a3e635] font-bold text-xl tracking-tight">🌱kusa🥺</span>
        </div>
        <div className="flex items-center space-x-2.5 text-xs">
          <span className="text-[#a3e635] border border-[#a3e635]/30 rounded px-2 py-0.5 font-bold bg-[#a3e635]/5">
            {bbsMode}
          </span>
          <div className="flex items-center space-x-1 bg-gray-100/10 rounded-full px-2 py-0.5">
            <Timer size={12} className="text-orange-400" />
            <span className="font-mono">{currentTime}</span>
          </div>
          <button
            onClick={onOpenDrawer}
            className="p-1 hover:bg-gray-100/10 rounded transition-colors"
            aria-label="メニューを開く"
          >
            <Menu size={22} className="text-gray-200" />
          </button>
        </div>
      </div>
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center space-x-2">
          <span className="text-gray-500">今日のID :</span>
          <span className="bg-blue-600/20 text-blue-400 border border-blue-500/35 px-2.5 py-0.5 rounded-full font-bold">
            {userId}
          </span>
          <span className="text-gray-500 ml-1">サーバ :</span>
          <span className="text-[#a3e635] font-bold">{server}</span>
        </div>
        <Search size={18} className="text-gray-500 cursor-pointer hover:text-white transition-colors" />
      </div>
    </header>
  );
};

interface TopTabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TopTabs = ({ activeTab, setActiveTab }: TopTabsProps) => (
  <div className="flex flex-col border-b border-gray-800 shrink-0 bg-[#0b0e14] z-10">
    <div className="flex justify-between px-6 py-2.5 font-bold text-sm text-gray-500">
      <button
        onClick={() => setActiveTab('everyone')}
        className={`pb-1 transition-colors ${activeTab === 'everyone' ? 'text-gray-100 border-b-2 border-blue-500' : 'hover:text-gray-300'}`}
      >
        みんな
      </button>
      <button
        onClick={() => setActiveTab('following')}
        className={`pb-1 transition-colors ${activeTab === 'following' ? 'text-gray-100 border-b-2 border-blue-500' : 'hover:text-gray-300'}`}
      >
        フォロー中
      </button>
      <button
        onClick={() => setActiveTab('ranking')}
        className={`pb-1 transition-colors ${activeTab === 'ranking' ? 'text-gray-100 border-b-2 border-blue-500' : 'hover:text-gray-300'}`}
      >
        ランキング
      </button>
      <button
        onClick={() => setActiveTab('game')}
        className={`pb-1 transition-colors ${activeTab === 'game' ? 'text-gray-100 border-b-2 border-blue-500' : 'hover:text-gray-300'}`}
      >
        ゲーム
      </button>
    </div>
    <div className="flex space-x-4 px-4 py-1.5 text-xs bg-gray-100/5 text-gray-400 border-t border-gray-800/40">
      <span className="font-bold flex items-center">
        最新スレ <span className="bg-blue-600 text-white text-[9px] rounded-full px-1 ml-1 font-bold">2</span>
      </span>
      <span className="flex items-center">
        最新レス <span className="bg-blue-600/50 text-white text-[9px] rounded-full px-1.5 ml-1 font-bold">99+</span>
      </span>
      <span>メディア</span>
    </div>
  </div>
);

interface RankingSubTabsProps {
  activeCategory: string;
  setActiveCategory: (cat: string) => void;
}

const RankingSubTabs = ({ activeCategory, setActiveCategory }: RankingSubTabsProps) => {
  const categories = ['コメ', 'イイ', 'ダメ', 'フォロワー', '返信', 'スレ', 'グルチャ', '🥺'];

  return (
    <div className="flex items-center space-x-1 border-b border-gray-800 px-2 py-1 bg-gray-900/40 overflow-x-auto scrollbar-none shrink-0">
      {categories.map((cat) => {
        const isActive = activeCategory === cat;
        return (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 text-xs font-bold rounded-full whitespace-nowrap transition-all ${isActive
              ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40 shadow-[0_0_8px_rgba(59,130,246,0.15)]'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-100/5'
              }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
};

interface RightDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  setUserId: (id: string) => void;
  server: string;
  setServer: (s: string) => void;
  bbsMode: string;
  setBbsMode: (m: string) => void;
}

const RightDrawer = ({ isOpen, onClose, userId, setUserId, server, setServer, bbsMode, setBbsMode }: RightDrawerProps) => {
  const [editingId, setEditingId] = useState(userId);

  const handleIdChangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId.trim()) {
      setUserId(editingId.trim());
    }
  };

  return (
    <>
      <div
        className={`absolute inset-0 bg-black/70 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`absolute top-0 right-0 h-full w-4/5 max-w-[320px] bg-[#0f121a] border-l border-gray-800 z-50 flex flex-col transition-transform duration-300 transform shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#0b0e14]">
          <div className="flex items-center space-x-2">
            <Settings size={18} className="text-[#a3e635]" />
            <span className="font-bold text-sm text-gray-200">掲示板システム設定</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100/10 rounded-full text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">IDカスタマイズ</label>
            <form onSubmit={handleIdChangeSubmit} className="flex space-x-1.5">
              <input
                type="text"
                value={editingId}
                onChange={(e) => setEditingId(e.target.value)}
                className="flex-1 bg-gray-100/5 hover:bg-gray-100/10 focus:bg-gray-100/10 rounded-lg px-2.5 py-1.5 text-xs outline-none text-white border border-gray-800 focus:border-blue-500/55 transition-colors"
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors flex items-center justify-center shrink-0"
              >
                更新
              </button>
            </form>
            <p className="text-[9px] text-gray-500">※変更するとタイムライン等に新規投稿する際のIDが変わります</p>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">表示モード切替</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setBbsMode('掲示板モード')}
                className={`py-2 text-xs font-bold rounded-lg border transition-all ${bbsMode === '掲示板モード'
                  ? 'bg-[#a3e635]/15 text-[#a3e635] border-[#a3e635]/55'
                  : 'bg-transparent text-gray-400 border-gray-800 hover:bg-gray-100/5'
                  }`}
              >
                掲示板モード
              </button>
              <button
                onClick={() => setBbsMode('SNSモード')}
                className={`py-2 text-xs font-bold rounded-lg border transition-all ${bbsMode === 'SNSモード'
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/55'
                  : 'bg-transparent text-gray-400 border-gray-800 hover:bg-gray-100/5'
                  }`}
              >
                SNSモード
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">接続サーバー</label>
            <div className="space-y-1.5">
              {['/main', '/sandbox', '/rpg_creators', '/gacha'].map((srv) => (
                <button
                  key={srv}
                  onClick={() => setServer(srv)}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg flex items-center justify-between border transition-all ${server === srv
                    ? 'bg-gray-100/10 text-[#a3e635] border-gray-700 font-bold'
                    : 'bg-transparent text-gray-400 border-transparent hover:bg-gray-100/5'
                    }`}
                >
                  <span>{srv}</span>
                  {server === srv && <Check size={14} className="text-[#a3e635]" />}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-gray-800" />

          <div className="space-y-2 text-xs text-gray-400">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">kusaのステータス</label>
            <div className="bg-gray-100/5 rounded-xl p-3 border border-gray-800 space-y-2">
              <div className="flex justify-between">
                <span>ユーザーレベル</span>
                <span className="text-[#a3e635] font-bold">Lv.42</span>
              </div>
              <div className="flex justify-between">
                <span>総投稿数</span>
                <span>124 スレッド</span>
              </div>
              <div className="flex justify-between">
                <span>総いいね獲得数</span>
                <span>4.8k Likes</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-800 bg-[#0b0e14] text-center text-[10px] text-gray-600">
          <span>🌱 kusa Mobile Core v1.4.2 🥺</span>
        </div>
      </div>
    </>
  );
};

interface FeedListProps {
  posts: Post[];
  activeTab: string;
  rankCategory: string;
  onLike: (id: number) => void;
  onDislike: (id: number) => void;
  onRepost: (id: number) => void;
  onAddReply: (id: number, text: string) => void;
  openGame: () => void;
  openDrawing: () => void;
}

const FeedList = ({ posts, activeTab, rankCategory, onLike, onDislike, onRepost, onAddReply, openGame, openDrawing }: FeedListProps) => {
  let displayPosts = [...posts];

  if (activeTab === 'ranking') {
    if (rankCategory === 'イイ') {
      displayPosts.sort((a, b) => b.likes - a.likes);
    } else if (rankCategory === 'コメ') {
      displayPosts.sort((a, b) => b.repliesCount - a.repliesCount);
    } else if (rankCategory === 'ダメ') {
      displayPosts.sort((a, b) => b.dislikes - a.dislikes);
    } else {
      displayPosts.sort((a, b) => b.heartsTotal - a.heartsTotal);
    }
  } else if (activeTab === 'game') {
    displayPosts = displayPosts.filter(p => p.hasGame || p.content.includes('#ゲーム') || p.id === 3);
  } else if (activeTab === 'following') {
    displayPosts = displayPosts.filter(p => p.id === 1 || p.id === 3);
  }

  return (
    <div className="divide-y divide-gray-800/80">
      {displayPosts.map((post, index) => (
        <PostContainer
          key={post.id}
          post={post}
          isRankingMode={activeTab === 'ranking'}
          rankIndex={index + 1}
          rankCategory={rankCategory}
          onLike={onLike}
          onDislike={onDislike}
          onRepost={onRepost}
          onAddReply={onAddReply}
          openGame={openGame}
          openDrawing={openDrawing}
        />
      ))}
      <div className="p-8 text-center text-xs text-gray-600 bg-gray-900/10">
        すべて表示されました 🌱
      </div>
    </div>
  );
};

interface PostContainerProps {
  post: Post;
  isRankingMode: boolean;
  rankIndex: number;
  rankCategory: string;
  onLike: (id: number) => void;
  onDislike: (id: number) => void;
  onRepost: (id: number) => void;
  onAddReply: (id: number, text: string) => void;
  openGame: () => void;
  openDrawing: () => void;
}

const PostContainer = ({ post, isRankingMode, rankIndex, rankCategory, onLike, onDislike, onRepost, onAddReply, openGame, openDrawing }: PostContainerProps) => {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');

  const getRankScoreDisplay = () => {
    if (rankCategory === 'イイ') return `${post.likes} いいね`;
    if (rankCategory === 'コメ') return `${post.repliesCount} コメ`;
    if (rankCategory === 'ダメ') return `${post.dislikes} ダメ`;
    return `${post.repliesCount} レス`;
  };

  return (
    <div className={`flex relative transition-all ${isRankingMode ? 'bg-gradient-to-r from-gray-900/10 via-transparent to-transparent' : ''}`}>
      {isRankingMode && (
        <div className="w-10 shrink-0 flex items-start justify-center pt-4 pl-1">
          <span className={`font-mono font-bold text-sm ${rankIndex === 1 ? 'text-yellow-500 scale-110 drop-shadow-[0_0_8px_rgba(234,179,8,0.2)]' :
            rankIndex === 2 ? 'text-gray-400' :
              rankIndex === 3 ? 'text-amber-600' : 'text-gray-600'
            }`}>
            {rankIndex}
          </span>
        </div>
      )}

      {isRankingMode && (
        <div className="absolute top-4 right-3 flex flex-col items-end z-10 pointer-events-none">
          <span className="text-[10px] font-bold text-gray-400 bg-[#0f121a]/80 px-2 py-0.5 rounded border border-gray-800">
            {getRankScoreDisplay()}
          </span>
        </div>
      )}

      <div className="flex-1 p-3 flex space-x-2.5 min-w-0 pr-4">
        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${post.avatarColor} shrink-0 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-white relative`}>
          {post.name.substring(3, 5) || "名無"}
          <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5 border border-gray-800">
            <Plus size={8} className="text-gray-400" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-0.5">
            <div className="flex items-baseline space-x-1.5">
              <span className="font-bold text-xs text-gray-200">{post.name}</span>
              <span className="text-gray-500 text-[10px] font-medium">{post.time}</span>
            </div>
            <MoreHorizontal size={14} className="text-gray-500 hover:text-gray-300 cursor-pointer" />
          </div>

          <p className="text-[13px] text-gray-200 whitespace-pre-wrap leading-relaxed mb-2.5">
            {post.content.split('\n').map((line, lIdx) => (
              <span key={lIdx} className="block">
                {line.split(' ').map((word, wIdx) => {
                  if (word.startsWith('#')) {
                    return <span key={wIdx} className="text-blue-400 mr-1 cursor-pointer hover:underline">{word}</span>;
                  }
                  return <span key={wIdx}>{word} </span>;
                })}
              </span>
            ))}
          </p>

          {post.hasImage && (
            <div className="relative rounded-xl overflow-hidden border border-gray-800 mb-2.5 bg-[#1a1b26] max-h-[220px]">
              <img
                src={post.imageSrc}
                alt={post.imageAlt || "ユーザーアート"}
                className="w-full h-auto object-cover max-h-[220px]"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="100%" height="100%" fill="%231a1b26"/><circle cx="160" cy="90" r="50" fill="orange" opacity="0.8"/><text x="160" y="95" fill="white" font-weight="bold" text-anchor="middle" font-size="14">ねるネルねるね</text></svg>`;
                }}
              />
              {post.hasCollabButton && (
                <button
                  onClick={openDrawing}
                  className="absolute bottom-2.5 right-2.5 bg-black/75 hover:bg-black/90 px-2.5 py-1 rounded-full text-[10px] text-[#a3e635] flex items-center space-x-1 border border-gray-800 font-bold active:scale-95 transition-all"
                >
                  <Edit3 size={11} />
                  <span>コラボ</span>
                </button>
              )}
            </div>
          )}

          {post.hasGame && (
            <div
              onClick={openGame}
              className="w-full aspect-[16/9] bg-gray-900 rounded-xl mb-3 flex items-center justify-center overflow-hidden border border-gray-800 relative group cursor-pointer transition-all shadow-inner"
            >
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=800')] bg-cover bg-center opacity-30 group-hover:opacity-40 transition-opacity"></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
              <div className="z-10 flex flex-col items-center space-y-1">
                <div className="bg-red-600 p-3 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)] group-hover:scale-110 transition-transform">
                  <PlaySquare size={28} className="text-white ml-0.5" />
                </div>
                <span className="text-[9px] tracking-widest text-gray-400 font-bold bg-black/60 px-2 py-0.5 rounded backdrop-blur mt-1.5">TAP TO PLAY GAME</span>
              </div>
              <div className="absolute bottom-2 left-2.5 z-10 flex items-center space-x-1.5">
                <span className="font-bold text-xs bg-red-600/90 text-white px-2 py-0.5 rounded">escape_the_mushroom</span>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center text-gray-500 mt-1 max-w-[280px]">
            <button
              onClick={() => onLike(post.id)}
              className={`flex items-center space-x-1 hover:text-blue-400 transition-colors ${post.liked ? 'text-blue-400 font-bold' : ''}`}
            >
              <ThumbsUp size={14} />
              <span className="text-[11px]">{post.likes || ''}</span>
            </button>

            <button
              onClick={() => onDislike(post.id)}
              className={`flex items-center space-x-1 hover:text-red-500 transition-colors ${post.disliked ? 'text-red-500 font-bold' : ''}`}
            >
              <ThumbsDown size={14} />
              <span className="text-[11px]">{post.dislikes || ''}</span>
            </button>

            <button
              onClick={() => setShowReplyInput(!showReplyInput)}
              className={`flex items-center space-x-1 hover:text-green-400 transition-colors ${showReplyInput ? 'text-green-400' : ''}`}
            >
              <MessageCircle size={14} />
              <span className="text-[11px]">{post.repliesCount || ''}</span>
            </button>

            <button
              onClick={() => onRepost(post.id)}
              className={`flex items-center space-x-1 hover:text-purple-400 transition-colors ${post.reposted ? 'text-purple-400' : ''}`}
            >
              <Repeat size={14} />
              <span className="text-[11px]">{post.reposts || ''}</span>
            </button>

            <button className="flex items-center hover:text-blue-400 transition-colors">
              <Mail size={14} />
            </button>

            <div className="flex items-center space-x-1 text-gray-600">
              <Heart size={12} className="fill-current text-pink-600/65" />
              <span className="text-[10px]">{post.heartsTotal || '0'}</span>
            </div>
          </div>

          {post.replies.length > 0 && (
            <div className="mt-2 pl-2.5 border-l-2 border-gray-800 space-y-1.5">
              {post.replies.map(reply => (
                <div key={reply.id} className="text-[11px] bg-gray-100/5 p-2 rounded-lg border border-gray-800/40">
                  <div className="flex justify-between text-gray-500 mb-0.5 font-bold">
                    <span>{reply.name}</span>
                    <span>{reply.time}</span>
                  </div>
                  <p className="text-gray-300">{reply.content}</p>
                </div>
              ))}
            </div>
          )}

          {showReplyInput && (
            <div className="mt-2.5 flex items-center space-x-2 bg-gray-100/5 rounded-lg px-2.5 py-1.5 border border-gray-800">
              <input
                type="text"
                placeholder="返信を書き込む..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="bg-transparent flex-1 text-xs outline-none text-gray-100 placeholder:text-gray-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onAddReply(post.id, replyText);
                    setReplyText('');
                    setShowReplyInput(false);
                  }
                }}
              />
              <button
                onClick={() => {
                  onAddReply(post.id, replyText);
                  setReplyText('');
                  setShowReplyInput(false);
                }}
                className="text-blue-500 hover:text-blue-400 text-xs font-bold px-1"
              >
                送信
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface BottomNavProps {
  current: string;
  set: (id: string) => void;
}

const BottomNav = ({ current, set }: BottomNavProps) => {
  const items = [
    { id: 'home', icon: Home, label: 'ホーム' },
    { id: 'search', icon: Search, label: '検索' },
    { id: 'notifications', icon: Bell, label: '通知' },
    { id: 'messages', icon: Mail, label: 'メッセージ' },
    { id: 'profile', icon: User, label: 'マイ' },
  ];

  return (
    <div className="flex justify-around items-center h-14 border-t border-gray-800 bg-[#0b0e14]/95 backdrop-blur pb-safe absolute bottom-0 w-full z-25">
      {items.map(item => {
        const isActive = current === item.id;
        return (
          <button
            key={item.id}
            className={`p-2 rounded-full flex flex-col items-center justify-center transition-all ${isActive ? 'text-[#a3e635]' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => set(item.id)}
            title={item.label}
          >
            <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
          </button>
        );
      })}
    </div>
  );
};

interface FABProps {
  open: boolean;
  setOpen: (o: boolean) => void;
  openDrawing: () => void;
  openGame: () => void;
  openText: () => void;
}

const FAB = ({ open, setOpen, openDrawing, openGame, openText }: FABProps) => {
  return (
    <div className="absolute bottom-16 right-4 z-30 flex flex-col items-end">
      {open && (
        <div className="flex flex-col items-end space-y-2.5 mb-3 pr-1 animate-fade-in-up">
          <button
            onClick={openDrawing}
            className="flex items-center bg-[#14171f] hover:bg-gray-800 rounded-full py-2 px-4 shadow-xl border border-gray-800 text-xs font-bold text-gray-200"
          >
            <span className="mr-2.5">イラストを描く</span>
            <div className="bg-blue-500/20 p-1.5 rounded-full"><Pen size={12} className="text-blue-400" /></div>
          </button>
          <button
            onClick={openDrawing}
            className="flex items-center bg-[#14171f] hover:bg-gray-800 rounded-full py-2 px-4 shadow-xl border border-gray-800 text-xs font-bold text-gray-200"
          >
            <span className="mr-2.5">ドット絵を描く</span>
            <div className="bg-green-500/20 p-1.5 rounded-full"><Plus size={12} className="text-green-400" /></div>
          </button>
          <button
            onClick={openGame}
            className="flex items-center bg-[#14171f] hover:bg-gray-800 rounded-full py-2 px-4 shadow-xl border border-gray-800 text-xs font-bold text-gray-200"
          >
            <span className="mr-2.5">RPGを作る</span>
            <div className="bg-purple-500/20 p-1.5 rounded-full"><PlaySquare size={12} className="text-purple-400" /></div>
          </button>
          <button
            onClick={openText}
            className="flex items-center bg-[#14171f] hover:bg-gray-800 rounded-full py-2 px-4 shadow-xl border border-gray-800 text-xs font-bold text-gray-200"
          >
            <span className="mr-2.5">つぶやく</span>
            <div className="bg-gray-500/20 p-1.5 rounded-full"><Type size={12} className="text-gray-300" /></div>
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="w-12 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(37,99,235,0.4)] transition-all duration-300 active:scale-95"
        style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
      >
        <Plus size={24} />
      </button>
    </div>
  );
};

interface DrawingEditorProps {
  onClose: () => void;
  onSave: (data: string) => void;
}

const DrawingEditor = ({ onClose, onSave }: DrawingEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.parentElement!.clientWidth;
    canvas.height = canvas.parentElement!.clientHeight || 320;

    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveHistory(canvas);
  }, []);

  const saveHistory = (canvas: HTMLCanvasElement) => {
    const dataUrl = canvas.toDataURL();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(dataUrl);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.lineWidth = tool === 'eraser' ? 24 : 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#1a1b26' : currentColor;
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveHistory(canvasRef.current!);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      restoreFromHistory(history[idx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      restoreFromHistory(history[idx]);
    }
  };

  const restoreFromHistory = (dataUrl: string) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveHistory(canvas);
  };

  const colorsRow1 = ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
  const colorsRow2 = ['#6b7280', '#ec4899', '#f43f5e', '#14b8a6', '#facc15', '#fed7aa', '#60a5fa', '#a855f7'];

  return (
    <div className="absolute inset-0 bg-[#0f0f11] z-50 flex flex-col select-none">
      <div className="flex items-center px-3.5 py-2.5 border-b border-gray-800 shrink-0 bg-[#0f0f11]">
        <button onClick={onClose} className="mr-2 text-gray-400 hover:bg-gray-100/10 p-1.5 rounded transition-colors">
          <X size={20} />
        </button>
        <span className="font-bold text-xs text-gray-300">キャンセル</span>
        <span className="text-gray-600 mx-1.5 text-[10px]">›</span>
        <span className="text-gray-400 text-xs">お絵かきツール</span>
      </div>

      <div className="flex-1 bg-[#1a1b26] m-3 mb-1 rounded-xl border border-gray-800 shadow-inner overflow-hidden relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full block cursor-crosshair"
        />
        <div className="absolute bottom-2 left-2.5 bg-black/60 px-2 py-0.5 rounded text-[10px] text-gray-500 pointer-events-none">
          キャンバスに触れて描画
        </div>
      </div>

      <div className="px-3.5 pb-4 pt-2.5 space-y-2.5 shrink-0 bg-[#0f0f11] border-t border-gray-900">
        <div className="flex space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setTool('pen')}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${tool === 'pen' ? 'bg-blue-600 text-white' : 'bg-gray-100/10 text-gray-300'}`}
          >
            <Pen size={15} />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${tool === 'eraser' ? 'bg-blue-600 text-white' : 'bg-gray-100/10 text-gray-300'}`}
          >
            <Eraser size={15} />
          </button>
          <div className="w-px h-6 bg-gray-800 self-center"></div>
          <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100/10 text-gray-300"><Minus size={15} className="rotate-45" /></button>
          <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100/10 text-gray-300"><Triangle size={15} /></button>
          <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100/10 text-gray-300"><PaintBucket size={15} /></button>
          <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100/10 text-gray-300"><Layers size={15} /></button>
        </div>

        <div className="flex justify-between items-center text-xs">
          <span className="bg-gray-100/5 px-2.5 py-1 rounded border border-gray-800 font-bold text-[9px] text-gray-400">
            {tool === 'pen' ? '🖋️ ペンモード' : '🧼 消しゴムモード'}
          </span>
          <div className="flex space-x-1.5">
            <button onClick={clearCanvas} className="w-7 h-7 rounded bg-red-950/20 text-red-400 border border-red-900/30 flex items-center justify-center">
              <Trash2 size={13} />
            </button>
            <button onClick={handleUndo} disabled={historyIndex <= 0} className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center disabled:opacity-40">
              <Undo size={11} className="mr-1" /> 進む
            </button>
            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="px-2 h-7 rounded bg-gray-100/10 text-gray-300 flex items-center disabled:opacity-40">
              <Redo size={11} className="mr-1" /> 戻る
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-3 pt-0.5">
          <div className="relative w-9 h-9 shrink-0 rounded border border-gray-700 overflow-hidden" style={{ backgroundColor: currentColor }} />
          <div className="flex-1 flex flex-col space-y-1">
            <div className="flex justify-between space-x-1">
              {colorsRow1.map(c => <button key={c} className={`h-5 flex-1 rounded-sm border ${currentColor === c ? 'border-white' : 'border-gray-700/50'}`} style={{ backgroundColor: c }} onClick={() => { setCurrentColor(c); setTool('pen'); }} />)}
            </div>
            <div className="flex justify-between space-x-1">
              {colorsRow2.map(c => <button key={c} className={`h-5 flex-1 rounded-sm border ${currentColor === c ? 'border-white' : 'border-gray-700/50'}`} style={{ backgroundColor: c }} onClick={() => { setCurrentColor(c); setTool('pen'); }} />)}
            </div>
          </div>
        </div>

        <button onClick={() => onSave(canvasRef.current!.toDataURL())} className="w-full bg-[#1db854] hover:bg-[#1ed760] text-gray-900 font-bold py-2.5 rounded-lg shadow-lg mt-1 transition-colors text-xs">
          この絵を投稿に添付する 🌱
        </button>
      </div>
    </div>
  );
};

interface GamePlayerProps {
  onClose: () => void;
  onPostScore: (score: number) => void;
}

interface Obstacle {
  x: number;
  y: number;
  size: number;
  passed?: boolean;
}

const GamePlayer = ({ onClose, onPostScore }: GamePlayerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const stateRef = useRef({
    playerY: 120,
    targetY: 120,
    obstacles: [] as Obstacle[],
    frame: 0,
    speed: 3,
    audioContext: null as AudioContext | null
  });

  const playBip = (freq: number, duration: number) => {
    try {
      if (!stateRef.current.audioContext) {
        stateRef.current.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = stateRef.current.audioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) { }
  };

  const handleControl = (dir: 'up' | 'down') => {
    const step = 45;
    if (dir === 'up') {
      stateRef.current.targetY = Math.max(30, stateRef.current.targetY - step);
      playBip(587, 0.08);
    } else {
      stateRef.current.targetY = Math.min(220, stateRef.current.targetY + step);
      playBip(494, 0.08);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frameId: number;

    const gameLoop = () => {
      ctx.fillStyle = '#0f111a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#a3e63515';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }

      if (isPlaying && !gameOver) {
        const state = stateRef.current;
        state.frame++;

        state.playerY += (state.targetY - state.playerY) * 0.25;

        if (state.frame % 70 === 0) {
          state.obstacles.push({
            x: canvas.width,
            y: Math.random() * (canvas.height - 50) + 20,
            size: 15
          });
        }

        state.obstacles.forEach((obs) => {
          obs.x -= state.speed;

          const dist = Math.hypot(obs.x - 60, obs.y - state.playerY);
          if (dist < obs.size + 12) {
            setGameOver(true);
            setIsPlaying(false);
            playBip(180, 0.4);
          }

          if (obs.x < 60 && !obs.passed) {
            obs.passed = true;
            setScore(s => s + 100);
            playBip(880, 0.05);
          }
        });

        state.obstacles = state.obstacles.filter(o => o.x > -30);
      }

      const state = stateRef.current;
      state.obstacles.forEach(o => {
        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(o.x - 3, o.y - 3, 6, 6);
      });

      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.arc(60, state.playerY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#15803d';
      ctx.ellipse(56, state.playerY - 10, 5, 9, -Math.PI / 4, 0, Math.PI * 2);
      ctx.ellipse(64, state.playerY - 10, 5, 9, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      frameId = requestAnimationFrame(gameLoop);
    };

    gameLoop();
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, gameOver]);

  return (
    <div className="absolute inset-0 bg-[#07080b] z-50 flex flex-col justify-between">
      <div className="flex items-center justify-between px-3.5 py-3 bg-[#0f0f11] border-b border-gray-800 shrink-0">
        <div className="flex items-center">
          <button onClick={onClose} className="mr-3 p-1.5 text-gray-400 hover:bg-gray-100/10 rounded-full">
            <X size={20} />
          </button>
          <div>
            <h2 className="font-bold text-xs leading-tight text-white">さとるのちんぽ escape</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">kusaサンドボックス実行コンテキスト</p>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <canvas ref={canvasRef} width={340} height={260} className="max-w-full bg-[#111319] border-y border-gray-800" />

        <div className="absolute top-2 left-4 text-xs font-bold font-mono text-gray-400">
          SCORE: {score}
        </div>

        {!isPlaying && !gameOver && (
          <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center text-center">
            <button
              onClick={() => { setIsPlaying(true); setGameOver(false); setScore(0); stateRef.current.obstacles = []; }}
              className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
            >
              <PlaySquare size={24} className="text-white ml-0.5" />
            </button>
            <span className="text-xs font-bold tracking-wider text-gray-300 mt-2">TAP TO PLAY</span>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-center p-4 z-10">
            <span className="text-red-500 font-bold text-base tracking-widest mb-1 animate-bounce">GAME OVER</span>
            <p className="text-gray-300 text-xs mb-4">スコア: {score}</p>
            <div className="flex flex-col space-y-2 w-44">
              <button onClick={() => { setIsPlaying(true); setGameOver(false); setScore(0); stateRef.current.obstacles = []; }} className="bg-blue-600 py-1.5 rounded-lg text-xs font-bold text-white">リトライ</button>
              <button onClick={() => onPostScore(score)} className="bg-[#a3e635] py-1.5 rounded-lg text-xs font-bold text-black flex items-center justify-center space-x-1"><Repeat size={12} /> <span>スコアをBBSに投稿</span></button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#0f0f11] border-t border-gray-900 p-3 shrink-0 flex items-center justify-between">
        <div className="flex space-x-2">
          <button onTouchStart={() => handleControl('up')} onMouseDown={() => handleControl('up')} className="w-10 h-10 bg-gray-100/10 rounded-full border border-gray-800 flex items-center justify-center text-white text-xs font-bold">▲</button>
          <button onTouchStart={() => handleControl('down')} onMouseDown={() => handleControl('down')} className="w-10 h-10 bg-gray-100/10 rounded-full border border-gray-800 flex items-center justify-center text-white text-xs font-bold">▼</button>
        </div>
        <span className="text-[10px] text-gray-500 select-none">操作: 左の上下ボタン</span>
      </div>
    </div>
  );
};

const SearchView = () => {
  const trends = ["#お絵描き", "ねるネルねるね", "さとるのちんぽ", "キョン風呂", "名無しBBS", "低遅延モード"];
  return (
    <div className="p-4 space-y-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 text-gray-500" size={16} />
        <input
          type="text"
          placeholder="掲示板内スレッド・素材を検索"
          className="w-full bg-gray-100/10 hover:bg-gray-100/15 rounded-full py-2 pl-10 pr-4 text-xs outline-none text-white transition-colors border border-gray-800"
        />
      </div>
      <div>
        <h3 className="font-bold text-xs text-gray-400 mb-2 pl-1">急上昇キーワード</h3>
        <div className="bg-gray-100/5 border border-gray-800 rounded-xl divide-y divide-gray-800/65">
          {trends.map((trend, idx) => (
            <div key={trend} className="p-3 flex justify-between items-center hover:bg-gray-100/5 transition-colors cursor-pointer text-xs">
              <div>
                <span className="text-gray-500 mr-2.5 font-bold">{idx + 1}</span>
                <span className="font-bold text-gray-200">{trend}</span>
              </div>
              <span className="text-[10px] text-gray-600">{(150 - idx * 25)}k スレッド</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const NotificationView = () => {
  const notifs = [
    { id: 1, user: "名無しyCK", action: "がいいねしました", target: "ねるネルねるね", time: "5分前" },
    { id: 2, user: "名無しrvf", action: "が改変リポストしました", target: "お絵かきツール", time: "12分前" }
  ];
  return (
    <div className="divide-y divide-gray-800">
      {notifs.map(n => (
        <div key={n.id} className="p-3.5 flex items-start space-x-3 text-xs hover:bg-gray-100/5">
          <Heart size={16} className="text-pink-500 shrink-0 mt-0.5 fill-current" />
          <div>
            <p className="text-gray-300">
              <span className="font-bold text-white mr-1">{n.user}</span>
              {n.action}「{n.target}」
            </p>
            <span className="text-[10px] text-gray-600 block mt-1">{n.time}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const MessageView = () => {
  const [messages, setMessages] = useState([
    { id: 1, sender: "管理人のちんぽ", text: "ようこそ！改変可能なクリエイティブBBSへ！", time: "昨日" },
    { id: 2, sender: "名無しdbF", text: "コラボのお絵描きバグってないかな？", time: "2時間前" }
  ]);
  const [msgInput, setMsgInput] = useState('');

  const sendMsg = () => {
    if (!msgInput.trim()) return;
    setMessages([...messages, { id: Date.now(), sender: "あなた", text: msgInput, time: "たった今" }]);
    setMsgInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.sender === 'あなた' ? 'items-end' : 'items-start'}`}>
            <span className="text-[10px] text-gray-500 mb-0.5">{m.sender} ・ {m.time}</span>
            <div className={`p-2.5 rounded-2xl max-w-[80%] text-xs ${m.sender === 'あなた' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100/10 text-gray-200 rounded-tl-none'}`}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-gray-800 flex items-center space-x-2 bg-[#0b0e14]">
        <input
          type="text"
          value={msgInput}
          onChange={(e) => setMsgInput(e.target.value)}
          placeholder="ダイレクトメッセージを送信"
          className="flex-1 bg-gray-100/10 hover:bg-gray-100/15 rounded-full py-2 px-4 text-xs outline-none text-white border border-gray-800"
          onKeyDown={(e) => e.key === 'Enter' && sendMsg()}
        />
        <button onClick={sendMsg} className="bg-blue-600 p-2 rounded-full text-white hover:bg-blue-500"><Plus size={15} /></button>
      </div>
    </div>
  );
};

interface ProfileViewProps {
  userId: string;
  posts: Post[];
}

const ProfileView = ({ userId, posts }: ProfileViewProps) => {
  const myPosts = posts.filter(p => p.name === userId || p.name.includes("あなた"));
  return (
    <div className="flex flex-col">
      <div className="p-4 border-b border-gray-800 bg-gradient-to-b from-gray-100/5 to-transparent">
        <div className="flex items-center space-x-3.5 mb-2.5">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-base text-white border border-gray-700">
            {userId.substring(3, 5) || "vF"}
          </div>
          <div>
            <h2 className="font-bold text-sm text-white">{userId}</h2>
            <span className="text-[10px] text-gray-500">登録: たった今 (kusaモバイルポートフォリオ)</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          自作イラストやお絵描き・改変ゲーム履歴がここにポートフォリオとして保存されます。🌱
        </p>
      </div>
      <div className="p-3 bg-gray-100/5 text-xs font-bold text-gray-400 border-b border-gray-800">
        作成・改変した作品一覧 ({myPosts.length})
      </div>
      <div className="divide-y divide-gray-800">
        {myPosts.length > 0 ? (
          myPosts.map(p => (
            <div key={p.id} className="p-3 text-xs hover:bg-gray-100/5">
              <div className="flex justify-between text-gray-500 mb-1">
                <span>{p.time}</span>
                <span>👍 {p.likes}いいね</span>
              </div>
              <p className="text-gray-300 line-clamp-2">{p.content}</p>
            </div>
          ))
        ) : (
          <div className="p-10 text-center text-xs text-gray-600">
            投稿した作品はまだありません 🍃<br />
            お絵描きやつぶやきを作成してみましょう！
          </div>
        )}
      </div>
    </div>
  );
};
