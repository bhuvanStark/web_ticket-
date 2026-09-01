import React from 'react';
import { ArrowLeft, Bell } from 'lucide-react';

export function Header({
  title,
  subtitle,
  showBack,
  onBack,
  unreadCount = 0,
  onOpenNotifications,
  onOpenQrScanner // kept for backwards compatibility if passed, though unused now
}) {
  return (
    <header className="app-header">
      {/* Left Action */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        {showBack ? (
          <button 
            className="header-icon-btn" 
            onClick={onBack}
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
        ) : (
          <img 
            src="/tasktel-icon.png" 
            alt="TaskTel Logo Icon" 
            style={{ width: '34px', height: '34px', objectFit: 'contain' }} 
          />
        )}
      </div>

      {/* Center Title */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
        <div className="app-header-title" style={{ textAlign: 'center', fontSize: '17px' }}>{title || "TaskTel"}</div>
        {subtitle && <div className="app-header-subtitle" style={{ textAlign: 'center' }}>{subtitle}</div>}
      </div>

      {/* Right Action */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
        <button 
          className="header-icon-btn" 
          onClick={onOpenNotifications}
          title="Notifications"
        >
          <Bell size={18} />
          {unreadCount > 0 && <span className="badge-dot" />}
        </button>
      </div>
    </header>
  );
}
