// Quotation module entry point. Back-Office Quote Managers reach each page
// from their own nav entries (section = page id); the Super Admin gets one
// "Quotations" admin page with tabs and a read-only view. Access is checked
// against the backend here too, so a stale nav entry can never show data.
import React, { useEffect, useState } from 'react';
import { Lock, Loader2, Users, FileText, Package, Eye } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';
import { useQuoteAccess, queueQuoteNav, peekQueuedQuoteNav, clearQueuedQuoteNav } from './quoteShared';
import { QuoteLeadsPage } from './QuoteLeadsPage';
import { QuotationsPage } from './QuotationsPage';
import { QuoteItemsPage } from './QuoteItemsPage';

const TABS = [
  { id: 'quotations', label: 'Quotations', icon: FileText },
  { id: 'quote-leads', label: 'Quote Leads', icon: Users },
  { id: 'quote-items', label: 'Items', icon: Package }
];

export const QuoteWorkspace = ({ section: routedSection, onNavigate }) => {
  const access = useQuoteAccess(true, { recheck: true });
  const [tab, setTab] = useState('quotations');
  const [queued] = useState(peekQueuedQuoteNav);
  useEffect(() => { clearQueuedQuoteNav(); }, []);
  const [openQuoteId, setOpenQuoteId] = useState(queued.quoteId || null);
  const [quoteSearch, setQuoteSearch] = useState(queued.search || '');

  // Admin (no routed section) switches tabs locally; Back-Office navigates.
  const tabbed = !routedSection;
  const section = routedSection || tab;
  const go = (id) => (tabbed ? setTab(id) : onNavigate(id));
  const openQuotations = (nav) => {
    if (tabbed) { setOpenQuoteId(nav.quoteId || null); setQuoteSearch(nav.search || ''); setTab('quotations'); return; }
    queueQuoteNav(nav);
    onNavigate('quotations');
  };

  if (access.loading) {
    return <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 text-[#004898] animate-spin" /></div>;
  }
  if (!access.canAccess) {
    return <EmptyState title="No Access" subtitle="Quotations are available to Quote Managers only." icon="inbox" />;
  }
  const readOnly = access.mode !== 'manager';

  const page = section === 'quote-leads' ? (
    <QuoteLeadsPage
      readOnly={readOnly}
      onOpenQuote={(id) => openQuotations({ quoteId: id })}
    />
  ) : section === 'quote-items' ? (
    <QuoteItemsPage readOnly={readOnly} />
  ) : (
    <QuotationsPage
      key={openQuoteId || 'list'}
      readOnly={readOnly}
      openQuoteId={openQuoteId}
      initialSearch={quoteSearch}
      onNewQuote={() => go('quote-leads')}
    />
  );

  return (
    <div className="space-y-5">
      {tabbed && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-white border border-[#E4E7EC] rounded-xl p-1 shadow-xs w-fit">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => { setOpenQuoteId(null); setTab(id); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${tab === id ? 'bg-[#004898] text-white' : 'text-[#667085] hover:text-[#172033]'}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          {readOnly && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#475467] bg-[#F2F4F7] border border-[#E4E7EC] px-3 py-1.5 rounded-full w-fit">
              <Eye className="w-3.5 h-3.5" />Super Admin · view only<Lock className="w-3 h-3" />
            </span>
          )}
        </div>
      )}
      {page}
    </div>
  );
};
