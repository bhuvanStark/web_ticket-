import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer = () => {
  const { toast } = useApp();

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] animate-in slide-in-from-bottom-5 fade-in duration-200">
      {/* 'error' used to fall through to the blue info style with no icon,
          so a failed save looked like a routine notice. */}
      <div role="status" aria-live="polite" className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm font-semibold ${
        toast.type === 'success'
          ? 'bg-[#ECFDF3] border-[#ABE5C6] text-[#027A48]'
          : toast.type === 'warning'
          ? 'bg-[#FEF0C7] border-[#FEDF89] text-[#B54708]'
          : toast.type === 'error'
          ? 'bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]'
          : 'bg-[#EFF8FF] border-[#B2DDFF] text-[#175CD3]'
      }`}>
        {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#12B76A]" />}
        {toast.type === 'warning' && <AlertCircle className="w-5 h-5 text-[#F79009]" />}
        {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-[#F04438]" />}
        {(!toast.type || toast.type === 'info') && <Info className="w-5 h-5 text-[#004898]" />}
        <span>{toast.message}</span>
      </div>
    </div>
  );
};
