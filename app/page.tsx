'use client';

import { useState } from 'react';
import { Pen, PlaySquare, Music, X } from 'lucide-react';

import { Post } from '@/lib/types';
import { INITIAL_POSTS } from '@/lib/data';
import Header from '@/components/Header';
import TopTabs from '@/components/TopTabs';
import RankingSubTabs from '@/components/RankingSubTabs';
import RightDrawer from '@/components/RightDrawer';
import FeedList from '@/components/FeedList';
import BottomNav from '@/components/BottomNav';
import FAB from '@/components/FAB';
import DrawingEditor from '@/components/DrawingEditor';
import GamePlayer from '@/components/GamePlayer';
import MmlEditor from '@/components/MmlEditor';
import PostComposer from '@/components/PostComposer';
import SearchView from '@/components/SearchView';
import NotificationView from '@/components/NotificationView';
import MessageView from '@/components/MessageView';
import ProfileView from '@/components/ProfileView';

export default function App() {
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [currentNav, setCurrentNav] = useState('home');
  const [topTab, setTopTab] = useState('everyone');
  const [rankCategory, setRankCategory] = useState('イイ');
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userId, setUserId] = useState('名無しvFZ');
  const [server, setServer] = useState('/main');
  const [bbsMode, setBbsMode] = useState('掲示板モード');
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);

  const handleQuickPost = () => {
    setComposerOpen(true);
  };

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

  const handleSaveMml = (mml: string) => {
    setActiveScreen(null);
    setInputText(`#MML作曲 ${mml}`);
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
          onClose={() => { setActiveScreen(null); setTopTab('everyone'); }}
          onPostScore={(score) => {
            setInputText(`🎮 スコア: ${score} 点を獲得したぞ！ #ゲーム`);
            setActiveScreen(null);
          }}
        />
      )}
      {activeScreen === 'mml' && (
        <MmlEditor
          onClose={() => setActiveScreen(null)}
          onSave={handleSaveMml}
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
                        <button
                          onClick={() => setActiveScreen('mml')}
                          className="p-2 hover:bg-gray-100/10 rounded-full hover:text-pink-400 transition-colors"
                          title="MML作曲"
                        >
                          <Music size={18} />
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
                  onQuickPost={handleQuickPost}
                  openGame={() => setActiveScreen('game')}
                  openDrawing={() => setActiveScreen('drawing')}
                  openMml={() => setActiveScreen('mml')}
                />
              </>
            )}

            {currentNav === 'search' && <SearchView />}
            {currentNav === 'notifications' && <NotificationView />}
            {currentNav === 'messages' && <MessageView />}
            {currentNav === 'profile' && <ProfileView userId={userId} posts={posts} />}
          </div>

          <BottomNav current={currentNav} set={setCurrentNav} />

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
          onOpenGame={() => { setComposerOpen(false); setActiveScreen('game'); }}
          onOpenMml={() => { setComposerOpen(false); setActiveScreen('mml'); }}
        />
      )}
    </div>
  );
}
