import React, { useState } from 'react';
import { Search, Filter, Monitor, Clock, CheckCircle, ChevronRight, AlertCircle, MapPin, UserCheck, ShieldCheck, PenTool, Download, Building, User } from 'lucide-react';
import { CustomerSignatureModal } from '../components/CustomerSignatureModal';
import { generatePDF } from '../utils/pdfGenerator';

export function MyRequestsScreen({ tickets = [], onSelectTicket, onUpdateTicket }) {
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'completed' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicketForSign, setSelectedTicketForSign] = useState(null);

  const isResolvedOrClosed = (s) => {
    if (!s) return false;
    const str = s.toString().toLowerCase();
    return str.includes('resolve') || str.includes('close');
  };

  const filteredTickets = tickets.filter((t) => {
    const isCompleted = isResolvedOrClosed(t.status) || isResolvedOrClosed(t.dbStatus);

    if (activeTab === 'active' && isCompleted) return false;
    if (activeTab === 'completed' && !isCompleted) return false;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchesId = (t.id || '').toLowerCase().includes(q);
      const matchesRoom = (t.roomName || t.room || '').toLowerCase().includes(q);
      const matchesIssue = (t.issueTitle || t.title || '').toLowerCase().includes(q);
      const matchesStatus = (t.status || '').toLowerCase().includes(q);
      return matchesId || matchesRoom || matchesIssue || matchesStatus;
    }

    return true;
  });

  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const numA = parseInt((a.id || a.ticketNumber || '').toString().replace(/\D/g, '')) || 0;
    const numB = parseInt((b.id || b.ticketNumber || '').toString().replace(/\D/g, '')) || 0;
    return numB - numA;
  });

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      

      {/* Search & Tabs Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-tertiary)'
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticket #, issue, room or status..."
            style={{
              width: '100%',
              padding: '12px 14px 12px 42px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
              fontSize: '14px',
              outline: 'none',
              boxShadow: 'var(--shadow-sm)'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'active', label: 'Active Requests' },
            { id: 'completed', label: 'Closed / Signed' },
            { id: 'all', label: 'All Requests' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                borderRadius: '20px',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket List Container */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sortedTickets.length > 0 ? (
          sortedTickets.map((ticket) => {
            const ticketId = ticket.id || ticket.ticketNumber || '#TT-10482';
            const ticketIssue = ticket.issueTitle || ticket.title || 'Service Request';
            const isEpabxTicket = ticket.supportCategory === 'epabx';
            const roomName = ticket.roomName || ticket.room || (isEpabxTicket ? 'EPABX' : '—');
            const locName = ticket.locationName || ticket.location || '—';
            const completed = isResolvedOrClosed(ticket.status) || isResolvedOrClosed(ticket.dbStatus);
            const needsSignature = (ticket.status?.includes('Pending Customer') || ticket.serviceReport?.status === 'Pending Customer Signature') && !ticket.customerSignature;

            return (
              <div
                key={ticketId}
                onClick={() => onSelectTicket && onSelectTicket(ticket)}
                className="card hover-lift"
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  cursor: 'pointer',
                  borderLeft: needsSignature ? '4px solid #004898' : completed ? '4px solid #10B981' : '4px solid var(--color-primary)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '12px', color: 'var(--color-primary)' }}>
                    {ticketId}
                  </span>

                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '800',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      backgroundColor: needsSignature ? '#EFF5FC' : completed ? '#ECFDF5' : '#FEF3F2',
                      color: needsSignature ? '#004898' : completed ? '#047857' : '#B42318',
                      border: '1px solid',
                      borderColor: needsSignature ? '#B3D1F2' : completed ? '#A7F3D0' : '#FECDCA',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {needsSignature ? <PenTool size={11} /> : completed ? <CheckCircle size={11} /> : <Clock size={11} />}
                    <span>{needsSignature ? 'Pending Signature' : completed ? 'Closed & Signed' : ticket.status}</span>
                  </span>
                </div>

                <h4 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0 }}>
                  {ticketIssue}
                </h4>

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Monitor size={14} color="var(--color-primary)" />
                    <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{roomName}</span>
                  </div>
                  <span>•</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={13} color="var(--color-text-tertiary)" />
                    <span>{locName}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#475467', background: '#F8FAFC', padding: '5px 8px', borderRadius: '6px', border: '1px solid #E4E7EC' }}>
                  <User size={12} color="#004898" />
                  <span>Created by: <strong style={{ color: '#172033' }}>{ticket.createdBy?.name || "Alex Rivera"}</strong> ({ticket.createdBy?.role || "IT Director"})</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="card" style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <AlertCircle size={36} color="var(--color-text-tertiary)" style={{ margin: '0 auto 12px' }} />
            <h4 style={{ fontSize: '15px', fontWeight: '700', margin: '0 0 6px' }}>No Service Requests Found</h4>
            <p style={{ fontSize: '13px', margin: '0 0 16px' }}>There are no service tickets matching your search filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
