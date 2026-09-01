import React, { useEffect } from 'react';
import { Bell, MessageSquare, PhoneCall, X, CheckCircle, ShieldCheck } from 'lucide-react';

export function NotificationToast({ toast, onClose, onClick }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        right: '12px',
        background: '#0F172A',
        color: '#FFFFFF',
        borderRadius: '16px',
        padding: '12px 16px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
        zIndex: 999,
        border: '1px solid rgba(255, 255, 255, 0.15)',
        cursor: 'pointer',
        animation: 'toastSlideDown 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}
    >
      <div style={{
        width: '38px',
        height: '38px',
        borderRadius: '12px',
        background: '#004898',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <Bell size={20} color="#FFFFFF" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ fontSize: '10px', background: '#10B981', color: '#FFF', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
            PUSH & SMS
          </span>
          <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600' }}>Just Now</span>
        </div>

        <h4 style={{ fontSize: '13px', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {toast.title}
        </h4>

        <p style={{ fontSize: '12px', color: '#CBD5E1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' }}>
          {toast.message}
        </p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          background: 'none',
          border: 'none',
          color: '#94A3B8',
          cursor: 'pointer',
          padding: '4px'
        }}
      >
        <X size={16} />
      </button>

      <style>{`
        @keyframes toastSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
