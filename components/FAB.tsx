'use client';

import { Plus, Pen, PlaySquare, Type } from 'lucide-react';

interface FABProps {
  open: boolean;
  setOpen: (o: boolean) => void;
  openDrawing: () => void;
  openGame: () => void;
  openText: () => void;
}

export default function FAB({ open, setOpen, openDrawing, openGame, openText }: FABProps) {
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
}
