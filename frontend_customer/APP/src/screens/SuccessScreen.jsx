import React from 'react';
import { CheckCircle2, ArrowRight, Home, Shield, Clock } from 'lucide-react';

export function SuccessScreen({ ticket, onTrackRequest, onBackHome }) {
  return (
    <div style={{
      height: '100%',
      width: '100%',
      padding: '40px 24px 32px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      textAlign: 'center',
      background: 'var(--color-bg)'
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {/* Large Animated Success Icon */}
        <div style={{
          width: '88px',
          height: '88px',
          borderRadius: '50%',
          background: 'var(--color-success-bg)',
          color: 'var(--color-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          boxShadow: '0 12px 30px rgba(16, 185, 129, 0.25)'
        }}>
          <CheckCircle2 size={54} strokeWidth={2.4} />
        </div>

        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
          Service Request Submitted
        </h1>

        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '28px', maxWidth: '90%', lineHeight: '1.4' }}>
          Your request has been received by our service team. A technician is being assigned to your location.
        </p>

        {/* Ticket Summary Card */}
        <div className="card" style={{ width: '100%', maxWidth: '340px', textAlign: 'left', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Ticket Reference</span>
            <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-primary)' }}>
              #{ticket?.ticketNumber || ticket?.id || '—'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Status</span>
            <span className="badge badge-pending">
              <Clock size={12} />
              <span>{ticket?.status || 'Request Submitted'}</span>
            </span>
          </div>

          {(ticket?.roomName || ticket?.room) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Room</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                {ticket.roomName || ticket.room}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={onTrackRequest}
          className="btn-primary"
        >
          <span>Track Request</span>
          <ArrowRight size={18} />
        </button>

        <button
          onClick={onBackHome}
          className="btn-secondary"
        >
          <Home size={18} />
          <span>Back to Home</span>
        </button>
      </div>
    </div>
  );
}
