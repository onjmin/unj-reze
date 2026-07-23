'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getAvatarInfo } from '@/lib/avatar';

interface MessageViewProps {
  userId?: string;
}

export default function MessageView({ userId }: MessageViewProps) {
  const [messages, setMessages] = useState<{ id: number; sender: string; text: string; recipient?: string; time: string }[]>([]);
  const [msgInput, setMsgInput] = useState('');

  useEffect(() => {
    api.messages.list(userId).then(setMessages);
  }, [userId]);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const sendMsg = async () => {
    if (!msgInput.trim()) return;
    const msg = await api.messages.send({ sender: userId || '名無し', text: msgInput });
    setMessages([...messages, msg]);
    setMsgInput('');
  };

  const currentSender = userId || '名無し';

  const handleDelete = async (id: number) => {
    try {
      await api.messages.remove(id, currentSender);
      setMessages(prev => prev.filter(m => m.id !== id));
      setConfirmDeleteId(null);
    } catch { /* noop */ }
  };

  return (
    <div className="flex flex-col flex-1 pb-20">
      <div className="flex-1 p-4 space-y-4">
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col group ${m.sender === currentSender ? 'items-end' : 'items-start'}`}>
            <span className="text-[10px] text-gray-500 mb-0.5">{getAvatarInfo(m.sender).username} ・ {m.time}</span>
            <div className="flex items-center gap-1.5">
              {m.sender === currentSender && (
                confirmDeleteId === m.id ? (
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-red-400 font-bold">削除？</span>
                    <button onClick={() => handleDelete(m.id)} className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded font-bold">はい</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded">いいえ</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(m.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 p-1"
                    title="削除"
                  >
                    <Trash2 size={12} />
                  </button>
                )
              )}
              <div className={`p-2.5 rounded-2xl max-w-[80%] text-xs ${m.sender === currentSender ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100/10 text-gray-200 rounded-tl-none'}`}>
                {m.text}
              </div>
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="p-10 text-center text-xs text-gray-600">メッセージはまだありません</div>
        )}
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
}
