'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, User, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { getAvatarInfo } from '@/lib/avatar';
import { markMessagesSeen } from '@/lib/read-state';

interface MessageViewProps {
  userId?: string;
}

type MsgItem = { id: number; sender: string; text: string; recipient?: string; time: string };

export default function MessageView({ userId }: MessageViewProps) {
  const [messages, setMessages] = useState<MsgItem[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [newRecipientInput, setNewRecipientInput] = useState('');
  const [isStartingNew, setIsStartingNew] = useState(false);
  const [msgInput, setMsgInput] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);

  const currentSender = userId || '名無し';

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    api.messages.list(userId).then(msgs => {
      setMessages(msgs);
      markMessagesSeen(msgs);

      // 対話相手の自動選択（最初に見つかったパートナー）
      const firstPartner = msgs.map(m => m.sender === currentSender ? m.recipient : m.sender).find(Boolean);
      if (firstPartner) {
        setSelectedPartner(firstPartner);
      }
      setTimeout(() => scrollToBottom(false), 50);
    });
  }, [userId, currentSender]);

  // 対話相手（パートナー）の重複なしリスト
  const partners = Array.from(new Set(
    messages.map(m => (m.sender === currentSender ? m.recipient : m.sender)).filter(Boolean) as string[]
  ));

  const activePartner = isStartingNew ? newRecipientInput.trim() : selectedPartner;

  // 選択中パートナーとの 1対1 メッセージのみにフィルター
  const activeMessages = activePartner
    ? messages.filter(
        m =>
          (m.sender === currentSender && m.recipient === activePartner) ||
          (m.sender === activePartner && m.recipient === currentSender)
      )
    : [];

  const sendMsg = async () => {
    const targetRecipient = isStartingNew ? newRecipientInput.trim() : selectedPartner;
    const text = msgInput.trim();
    if (!text || !targetRecipient || isSendingRef.current) return;

    isSendingRef.current = true;
    try {
      const msg = await api.messages.send({
        sender: currentSender,
        recipient: targetRecipient,
        text,
      });
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
      setMsgInput('');
      if (isStartingNew) {
        setSelectedPartner(targetRecipient);
        setIsStartingNew(false);
        setNewRecipientInput('');
      }
      setTimeout(() => scrollToBottom(true), 50);
    } catch {
      /* noop */
    } finally {
      isSendingRef.current = false;
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.messages.remove(id, currentSender);
      setMessages(prev => prev.filter(m => m.id !== id));
      setConfirmDeleteId(null);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-[calc(100vh-44px-56px)] md:min-h-[calc(100vh-44px)]">
      {/* パートナー選択ヘッダー / タブ */}
      <div className="p-2 border-b border-gray-800 flex items-center gap-1.5 overflow-x-auto scrollbar-none bg-[#0b0e14]">
        {partners.map(p => {
          const isActive = !isStartingNew && selectedPartner === p;
          const avatar = getAvatarInfo(p);
          return (
            <button
              key={p}
              onClick={() => {
                setSelectedPartner(p);
                setIsStartingNew(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs shrink-0 transition-colors ${
                isActive
                  ? 'bg-[#a3e635] text-black font-bold'
                  : 'bg-gray-100/10 text-gray-300 hover:bg-gray-100/15'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center text-[9px] font-bold text-white">
                {avatar.username.charAt(0)}
              </span>
              <span>{avatar.username}</span>
            </button>
          );
        })}
        <button
          onClick={() => {
            setIsStartingNew(true);
            setSelectedPartner(null);
          }}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs shrink-0 transition-colors ${
            isStartingNew
              ? 'bg-blue-600 text-white font-bold'
              : 'bg-gray-100/10 text-gray-400 hover:text-white hover:bg-gray-100/15'
          }`}
        >
          <Plus size={13} />
          <span>新規DM</span>
        </button>
      </div>

      {/* 新規DM相手の入力欄 */}
      {isStartingNew && (
        <div className="p-3 border-b border-gray-800 bg-gray-900/50 flex items-center gap-2">
          <span className="text-xs text-gray-400 font-bold">送信先 (ID/名前):</span>
          <input
            type="text"
            value={newRecipientInput}
            onChange={e => setNewRecipientInput(e.target.value)}
            placeholder="相手のユーザー名を入力"
            className="flex-1 bg-gray-100/10 rounded px-3 py-1 text-xs text-white outline-none border border-gray-700"
          />
        </div>
      )}

      {/* 1対1 メッセージタイムライン */}
      <div className="flex-1 p-4 space-y-4 pb-24">
        {activeMessages.map(m => (
          <div
            key={m.id}
            className={`flex flex-col group ${
              m.sender === currentSender ? 'items-end' : 'items-start'
            }`}
          >
            <span className="text-[10px] text-gray-500 mb-0.5">
              {getAvatarInfo(m.sender).username} ・ {m.time}
            </span>
            <div className="flex items-center gap-1.5">
              {m.sender === currentSender &&
                (confirmDeleteId === m.id ? (
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-red-400 font-bold">削除？</span>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
                    >
                      はい
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
                    >
                      いいえ
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(m.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 p-1"
                    title="削除"
                  >
                    <Trash2 size={12} />
                  </button>
                ))}
              <div
                className={`p-2.5 rounded-2xl max-w-[80%] text-xs ${
                  m.sender === currentSender
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-gray-100/10 text-gray-200 rounded-tl-none'
                }`}
              >
                {m.text}
              </div>
            </div>
          </div>
        ))}

        {!activePartner && partners.length === 0 && (
          <div className="p-10 text-center text-xs text-gray-500 flex flex-col items-center gap-2">
            <MessageSquare size={24} className="text-gray-600" />
            <span>ダイレクトメッセージはありません。「新規DM」から相手を指定してメッセージを送信できます。</span>
          </div>
        )}

        {activePartner && activeMessages.length === 0 && (
          <div className="p-10 text-center text-xs text-gray-500">
            {getAvatarInfo(activePartner).username} さんとのメッセージはまだありません。
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 送信フォーム */}
      <div className="sticky bottom-14 z-30 p-3 border-t border-gray-800 flex items-center space-x-2 bg-[#0b0e14]/95 backdrop-blur">
        <input
          type="text"
          value={msgInput}
          onChange={e => setMsgInput(e.target.value)}
          placeholder={
            activePartner
              ? `${getAvatarInfo(activePartner).username} さんにメッセージを送信`
              : '送信先を指定してください'
          }
          disabled={!activePartner}
          className="flex-1 bg-gray-100/10 hover:bg-gray-100/15 disabled:opacity-50 rounded-full py-2 px-4 text-xs outline-none text-white border border-gray-800"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              sendMsg();
            }
          }}
        />
        <button
          onClick={sendMsg}
          disabled={!activePartner || !msgInput.trim()}
          className="bg-blue-600 disabled:opacity-50 p-2 rounded-full text-white hover:bg-blue-500"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
