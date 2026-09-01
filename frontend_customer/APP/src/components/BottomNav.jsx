import React from 'react';
import { Home, FileText, User } from 'lucide-react';

export function BottomNav({ activeTab, setActiveTab }) {
  return (
    <nav className="bottom-nav">
      <button
        className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => setActiveTab('home')}
      >
        <Home size={20} />
        <span>Home</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'requests' ? 'active' : ''}`}
        onClick={() => setActiveTab('requests')}
      >
        <FileText size={20} />
        <span>Service Requests</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
        onClick={() => setActiveTab('profile')}
      >
        <User size={20} />
        <span>Profile</span>
      </button>
    </nav>
  );
}
