'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

export default function MessageView() {
  const [messages, setMessages] = useState([
    { id: 1, sender: "名無しLm8", text: "おはよう！今日の雪写真見た？", time: "7時間前" },
    { id: 2, sender: "名無しXz9", text: "イラストまとめ見てくれてありがとう！", time: "2日前" },
    { id: 3, sender: "名無しQp7", text: "ドット絵のコツ教えてくれる？", time: "1日前" }
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
}
