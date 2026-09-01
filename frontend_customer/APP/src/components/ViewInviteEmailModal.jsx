import React from 'react';
import { X, Mail } from 'lucide-react';

export function ViewInviteEmailModal({ email, html, isLoading, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={18} color="var(--color-primary)" />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-text-primary)' }}>Invitation Email</div>
              {email && <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Sent to {email}</div>}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ maxHeight: '70vh', overflow: 'auto', background: '#f4f6f9' }}>
          {isLoading ? (
            <p style={{ padding: '24px', fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              Loading email preview...
            </p>
          ) : (
            <iframe
              title="Invitation email preview"
              srcDoc={html || ''}
              style={{ width: '100%', height: '520px', border: 'none', display: 'block' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
