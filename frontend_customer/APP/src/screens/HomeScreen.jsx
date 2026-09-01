import React, { useEffect, useState } from 'react';
import { PhoneCall, ArrowRight, MapPin, Monitor, ChevronRight, UserCheck, ShieldCheck } from 'lucide-react';
import { getGreeting } from '../utils/greeting';

export function HomeScreen({
  user,
  activeTicket,
  onBookService,
  onViewTicket,
  onViewAllRequests,
  onViewHistory,
  onOpenQrScanner
}) {
  // Re-check every minute so the greeting stays correct if the app is left open
  // across a time-of-day boundary.
  const [greeting, setGreeting] = useState(() => getGreeting());

  useEffect(() => {
    const interval = setInterval(() => setGreeting(getGreeting()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Top Welcome Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
            {greeting.text} {greeting.emoji}
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)', letterSpacing: '-0.3px' }}>
            {user?.name || 'Customer'}
          </h1>
          {user?.company && (
            <div style={{ marginTop: '2px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary)' }}>
                {user.company}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Dual Support Services CTA */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          
          {/* AV Support Card */}
          <div 
            onClick={() => onBookService('AV')}
            style={{
              background: 'linear-gradient(135deg, #004898 0%, #002D62 100%)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 16px',
              color: '#FFFFFF',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 10px 25px rgba(0, 72, 152, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '140px'
            }}>
            {/* Decorative Ring */}
            <div style={{ position: 'absolute', right: '-15px', bottom: '-20px', width: '90px', height: '90px', borderRadius: '50%', border: '12px solid rgba(255, 255, 255, 0.08)', pointerEvents: 'none' }} />
            
            <div style={{ zIndex: 1, position: 'relative' }}>
              <Monitor size={26} style={{ marginBottom: '14px', color: '#FFFFFF' }} />
              <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px', lineHeight: '1.2' }}>AV Support</h2>
              <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)', lineHeight: '1.3', maxWidth: '90%' }}>Audio, Video & Meeting Rooms</p>
            </div>
            
            <div style={{ zIndex: 1, position: 'relative', marginTop: '18px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: '#93C5FD' }}>
              <span>Book Ticket</span> <ArrowRight size={14} />
            </div>
          </div>

          {/* EPABX Support Card */}
          <div 
            onClick={() => onBookService('EPABX')}
            style={{
              background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 16px',
              color: '#FFFFFF',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 10px 25px rgba(15, 118, 110, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '140px'
            }}>
            {/* Decorative Ring */}
            <div style={{ position: 'absolute', right: '-15px', bottom: '-20px', width: '90px', height: '90px', borderRadius: '50%', border: '12px solid rgba(255, 255, 255, 0.08)', pointerEvents: 'none' }} />
            
            <div style={{ zIndex: 1, position: 'relative' }}>
              <PhoneCall size={26} style={{ marginBottom: '14px', color: '#FFFFFF' }} />
              <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px', lineHeight: '1.2' }}>EPABX Support</h2>
              <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)', lineHeight: '1.3', maxWidth: '90%' }}>Intercom & Telephony Systems</p>
            </div>

            <div style={{ zIndex: 1, position: 'relative', marginTop: '18px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: '#5EEAD4' }}>
              <span>Book Ticket</span> <ArrowRight size={14} />
            </div>
          </div>

        </div>

      {/* Active Requests Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
            Active Requests
          </h3>
          <button 
            onClick={onViewAllRequests}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <span>View All</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {activeTicket ? (
          <div 
            className="card card-clickable" 
            onClick={() => onViewTicket(activeTicket)}
            style={{ borderLeft: '4px solid var(--color-primary)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--color-primary)' }}>
                #{activeTicket.id || activeTicket.ticketNumber}
              </div>
              <span className="badge badge-assigned" style={{
                backgroundColor: activeTicket.status?.includes('Pending') ? '#EFF5FC' : '#ECFDF5',
                color: activeTicket.status?.includes('Pending') ? '#004898' : '#047857',
                border: '1px solid #B3D1F2',
                fontWeight: '800'
              }}>
                <UserCheck size={13} />
                <span>{activeTicket.status || 'Active Request'}</span>
              </span>
            </div>

            <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              {activeTicket.issue || activeTicket.title || activeTicket.issueTitle || 'AV System Issue'}
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Monitor size={14} color="var(--color-text-tertiary)" />
                <span style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>{activeTicket.roomName || activeTicket.room || 'Boardroom'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} color="var(--color-text-tertiary)" />
                <span>{activeTicket.locationName || activeTicket.location || 'Bengaluru Headquarters'}</span>
              </div>
            </div>

            {/* Quick Tech Preview & Action */}
            {activeTicket.technician && (
              <div style={{
                padding: '10px 12px',
                background: 'var(--color-bg)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={16} color="var(--color-primary)" />
                  <div>
                    <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{activeTicket.technician.name}</span>
                    <span style={{ color: 'var(--color-text-tertiary)', marginLeft: '6px' }}>ETA {activeTicket.technician.eta}</span>
                  </div>
                </div>
                <span style={{ color: 'var(--color-primary)', fontWeight: '700' }}>Track &rarr;</span>
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
            <p style={{ fontSize: '14px', fontWeight: '600' }}>No Active Requests</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Everything is running smoothly.</p>
          </div>
        )}
      </div>
    </div>
  );
}
