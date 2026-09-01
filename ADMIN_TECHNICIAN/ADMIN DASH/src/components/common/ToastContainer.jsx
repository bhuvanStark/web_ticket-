import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer = () => {
  const { toast } = useApp();

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm font-semibold ${
        toast.type === 'success'
          ? 'bg-[#ECFDF3] border-[#ABE5C6] text-[#027A48]'
          : toast.type === 'warning'
          ? 'bg-[#FEF0C7] border-[#FEDF89] text-[#B54708]'
          : 'bg-[#EFF8FF] border-[#B2DDFF] text-[#175CD3]'
      }`}>
        {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#12B76A]" />}
        {toast.type === 'warning' && <AlertCircle className="w-5 h-5 text-[#F79009]" />}
        {toast.type === 'info' && <Info className="w-5 h-5 text-[#004898]" />}
        <span>{toast.message}</span>
      </div>
    </div>
  );
};
