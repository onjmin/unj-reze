'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info } from 'lucide-react';
import { subscribeToast, ToastMessage } from '@/lib/toast';

const AUTO_DISMISS_MS = 4000;

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return subscribeToast((toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, AUTO_DISMISS_MS);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-100 flex flex-col gap-2 items-center pointer-events-none w-full px-4">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg backdrop-blur-md text-xs font-bold animate-fade-in-up max-w-[92vw] ${t.type === 'error'
            ? 'bg-red-500/90 text-white'
            : t.type === 'success'
              ? 'bg-[#a3e635]/90 text-black'
              : 'bg-gray-800/90 text-gray-100 border border-gray-700'
            }`}
        >
          {t.type === 'error' ? <XCircle size={15} className="shrink-0" /> : t.type === 'success' ? <CheckCircle2 size={15} className="shrink-0" /> : <Info size={15} className="shrink-0" />}
          <span className="truncate">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
