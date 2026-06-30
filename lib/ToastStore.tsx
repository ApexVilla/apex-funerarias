import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return ctx;
}

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Portal/Container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-md border shadow-lg min-w-[300px] max-w-md
              ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : ''}
              ${toast.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' : ''}
              ${toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-900' : ''}
              ${toast.type === 'info' ? 'bg-slate-50 border-slate-200 text-slate-800' : ''}
            `}
          >
            <div className="flex-shrink-0">
              {toast.type === 'success' && <CheckCircle className="h-5 w-5 text-emerald-600" />}
              {toast.type === 'error' && <AlertCircle className="h-5 w-5 text-rose-600" />}
              {toast.type === 'warning' && <AlertTriangle className="h-5 w-5 text-amber-600" />}
              {toast.type === 'info' && <Info className="h-5 w-5 text-blue-600" />}
            </div>
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button 
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-black/5 rounded-full transition-colors"
            >
              <X className="h-4 w-4 opacity-50" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
