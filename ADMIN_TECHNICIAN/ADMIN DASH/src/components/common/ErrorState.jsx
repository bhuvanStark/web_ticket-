import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export const ErrorState = ({
  title = "Unable to Load Requests",
  subtitle = "Something went wrong while loading service requests.",
  onRetry = null
}) => {
  return (
    <div className="p-8 bg-[#FEF3F2] border border-[#FECDCA] rounded-xl text-center my-4">
      <div className="w-12 h-12 rounded-full bg-[#FEE4E2] text-[#F04438] flex items-center justify-center mx-auto mb-3">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-[#B42318] mb-1">{title}</h3>
      <p className="text-xs text-[#B42318] max-w-md mx-auto mb-4">{subtitle}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#F04438] text-white text-xs font-bold rounded-lg hover:bg-[#D92D20] transition-all shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try Again</span>
        </button>
      )}
    </div>
  );
};
