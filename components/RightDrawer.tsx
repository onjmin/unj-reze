'use client';

import { useState, useEffect } from 'react';
import { Settings, X, Check, Home, ExternalLink, Lock, EyeOff, Heart, KeyRound, Copy } from 'lucide-react';
import Link from 'next/link';
import { AnonymousUser } from '@/lib/types';
import { api } from '@/lib/api';

function getCookieValue(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(`(?:^|;\\s*)${name}=([^;]*)`);
  return match ? decodeURIComponent(match[1]) : undefined;
}

interface RightDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  setUserId: (id: string) => void;
  server: string;
  setServer: (s: string) => void;
  bbsMode: string;
  setBbsMode: (m: string) => void;
  currentUser?: AnonymousUser | null;
}

export default function RightDrawer({ isOpen, onClose, userId, setUserId, server, setServer, bbsMode, setBbsMode, currentUser }: RightDrawerProps) {
  const [editingId, setEditingId] = useState(userId);
  const [privacy, setPrivacy] = useState({ isPrivate: false, hideFromSearch: false, hideReactions: false });
  const [migrationToken, setMigrationToken] = useState('');
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemMsg, setRedeemMsg] = useState('');

  useEffect(() => {
    if (isOpen && currentUser?.slug) {
      api.auth.getSettings(currentUser.slug).then(setPrivacy).catch(() => {});
    }
  }, [isOpen, currentUser?.slug]);

  const handleIdChangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId.trim()) {
      setUserId(editingId.trim());
      if (currentUser?.id) {
        api.auth.updateDisplayName(currentUser.id, editingId.trim());
      }
    }
  };

  const togglePrivacy = async (key: 'isPrivate' | 'hideFromSearch' | 'hideReactions') => {
    if (!currentUser?.slug) return;
    const next = { ...privacy, [key]: !privacy[key] };
    setPrivacy(next);
    try {
      await api.auth.updateSettings(currentUser.slug, { [key]: next[key] });
    } catch {
      setPrivacy(privacy); // 失敗時ロールバック
    }
  };

  const handleIssueToken = async () => {
    if (!currentUser?.id) return;
    try {
      const { token } = await api.auth.issueMigrationToken(currentUser.id);
      setMigrationToken(token);
    } catch { /* noop */ }
  };

  const handleCopyToken = () => {
    if (migrationToken) navigator.clipboard.writeText(migrationToken);
  };

  const handleRedeem = async () => {
    const token = redeemInput.trim();
    if (!token) return;
    let sessionId = getCookieValue('unj_reze_session');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      document.cookie = `unj_reze_session=${sessionId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    }
    try {
      const user = await api.auth.redeemMigrationToken(token, sessionId);
      setRedeemMsg(`「${user.displayName}」として復元しました。再読み込みします…`);
      setTimeout(() => { if (typeof window !== 'undefined') window.location.reload(); }, 800);
    } catch {
      setRedeemMsg('トークンが無効か期限切れです。');
    }
  };

  const PrivacyToggle = ({ label, desc, icon: Icon, active, onClick }: { label: string; desc: string; icon: React.ElementType; active: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-800 hover:bg-gray-100/5 transition-colors text-left"
    >
      <Icon size={14} className={active ? 'text-[#a3e635] shrink-0' : 'text-gray-500 shrink-0'} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-200">{label}</div>
        <div className="text-[9px] text-gray-500">{desc}</div>
      </div>
      <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${active ? 'bg-[#a3e635]' : 'bg-gray-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${active ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );

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

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">プライバシー</label>
            <div className="space-y-1.5">
              <PrivacyToggle
                label="鍵アカウント"
                desc="フォロワーのみに投稿を公開"
                icon={Lock}
                active={privacy.isPrivate}
                onClick={() => togglePrivacy('isPrivate')}
              />
              <PrivacyToggle
                label="検索から除外"
                desc="検索・トレンドに自分の投稿を出さない"
                icon={EyeOff}
                active={privacy.hideFromSearch}
                onClick={() => togglePrivacy('hideFromSearch')}
              />
              <PrivacyToggle
                label="リアクション履歴を非公開"
                desc="いいね／ハート等の履歴を隠す"
                icon={Heart}
                active={privacy.hideReactions}
                onClick={() => togglePrivacy('hideReactions')}
              />
            </div>
          </div>

          <div className="h-px bg-gray-800" />

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block flex items-center gap-1.5">
              <KeyRound size={12} /> アカウント移行トークン
            </label>
            <p className="text-[9px] text-gray-500">セッションが変わっても過去のアカウントを復元できます。</p>
            <button
              onClick={handleIssueToken}
              className="w-full bg-gray-100/5 hover:bg-gray-100/10 border border-gray-800 rounded-lg py-1.5 text-xs text-gray-200 transition-colors"
            >
              移行トークンを発行
            </button>
            {migrationToken && (
              <div className="flex items-center gap-1.5 bg-gray-100/5 border border-gray-800 rounded-lg px-2 py-1.5">
                <code className="flex-1 text-[10px] text-[#a3e635] truncate">{migrationToken}</code>
                <button onClick={handleCopyToken} className="text-gray-400 hover:text-white p-1 shrink-0" title="コピー">
                  <Copy size={12} />
                </button>
              </div>
            )}
            <div className="flex space-x-1.5">
              <input
                type="text"
                value={redeemInput}
                onChange={(e) => setRedeemInput(e.target.value)}
                placeholder="トークンを入力して復元"
                className="flex-1 bg-gray-100/5 hover:bg-gray-100/10 focus:bg-gray-100/10 rounded-lg px-2.5 py-1.5 text-xs outline-none text-white border border-gray-800 focus:border-blue-500/55 transition-colors"
              />
              <button
                onClick={handleRedeem}
                className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors shrink-0"
              >
                復元
              </button>
            </div>
            {redeemMsg && <p className="text-[9px] text-gray-400">{redeemMsg}</p>}
          </div>

          <div className="h-px bg-gray-800" />

          <div className="space-y-1">
            <Link
              href="/"
              onClick={onClose}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-100/8 rounded-lg transition-colors"
            >
              <Home size={16} className="text-gray-500 shrink-0" />
              <span>ホームに戻る</span>
            </Link>
            <a
              href="https://unj.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-100/8 rounded-lg transition-colors"
            >
              <ExternalLink size={16} className="text-gray-500 shrink-0" />
              <span>うんjに戻る</span>
            </a>
          </div>

          <div className="h-px bg-gray-800" />

          <div className="space-y-2 text-xs text-gray-400">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">うんｊレゼのステータス</label>
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
          <span>うんｊレゼ v0.1.0</span>
        </div>
      </div>
    </>
  );
}
