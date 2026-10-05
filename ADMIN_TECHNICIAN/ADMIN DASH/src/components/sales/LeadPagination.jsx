// Page controls for the Sales lead lists — same look as the Service
// Requests table's pagination, kept local so the ticket page is untouched.
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LEADS_PAGE_SIZE } from './leadPipeline';

const pageNumbers = (page, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, 2, totalPages - 1, totalPages, page - 1, page, page + 1]);
  return [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
};

// `count` = total matching leads on the server; shows "1–15 of 42".
export const LeadPagination = ({ page, totalPages, count, pageSize = LEADS_PAGE_SIZE, onChange }) => {
  if (count === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  const numbers = pageNumbers(page, totalPages);
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-1">
      <span className="text-xs text-[#667085]">
        Showing <strong className="text-[#172033]">{from}–{to}</strong> of {count}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5 max-md:max-w-full max-md:overflow-x-auto">
          <button onClick={() => onChange(page - 1)} disabled={page === 1} title="Previous page" className="p-2 rounded-lg border border-[#E4E7EC] text-[#475467] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" />
          </button>
          {numbers.map((p, idx) => (
            <React.Fragment key={p}>
              {idx > 0 && p - numbers[idx - 1] > 1 && <span className="px-1 text-xs text-[#98A2B3]">…</span>}
              <button
                onClick={() => onChange(p)}
                className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold ${p === page ? 'bg-[#004898] text-white' : 'text-[#475467] border border-[#E4E7EC] hover:bg-[#F8FAFC]'}`}
              >
                {p}
              </button>
            </React.Fragment>
          ))}
          <button onClick={() => onChange(page + 1)} disabled={page === totalPages} title="Next page" className="p-2 rounded-lg border border-[#E4E7EC] text-[#475467] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
