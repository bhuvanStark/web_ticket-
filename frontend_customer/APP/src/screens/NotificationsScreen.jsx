import React, { useState } from 'react';
import { Bell, CheckCheck, Clock, ShieldAlert, Smartphone, MessageSquare, Send, CheckCircle2, Sliders } from 'lucide-react';
import { requestNotificationPermission, sendWebPushNotification } from '../utils/notifications';

export function NotificationsScreen({
  notifications = [],
  onSelectTicket,
  onMarkAllRead,
  onSimulatePushAlert
}) {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [waEnabled, setWaEnabled] = useState(true);

  const handleTogglePush = async () => {
    if (!pushEnabled) {
      const granted = await requestNotificationPermission();
      setPushEnabled(granted || true);
    } else {
      setPushEnabled(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px', gap: '16px', overflowY: 'auto' }}>
      {/* Clean Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', marginTop: '4px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0 }}>
          Ticket Updates ({notifications.length})
        </h3>
        {notifications.length > 0 && (
          <button
            onClick={onMarkAllRead}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <CheckCheck size={16} />
            <span>Mark All Read</span>
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => notif.ticketId && onSelectTicket({ id: notif.ticketId })}
              style={{
                background: '#0F172A',
                color: '#FFFFFF',
                borderRadius: '16px',
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                opacity: notif.unread ? 1 : 0.7,
                border: notif.unread ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent'
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
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600' }}>{notif.time || 'Just Now'}</span>
                </div>
        
                <h4 style={{ fontSize: '13px', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                  {notif.title}
                </h4>
        
                <p style={{ fontSize: '12px', color: '#CBD5E1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px', marginBottom: 0 }}>
                  {notif.message}
                </p>
              </div>
            </div>
        ))}
      </div>
    </div>
  );
}
