import React, { useState } from 'react';
import { Building2, LogOut, Moon, Plus, Sun, UserRound, Users } from 'lucide-react';
import { AddTeamMemberModal } from '../components/AddTeamMemberModal';
import unifiedClient from '../api/unifiedClient';

export function ProfileScreen({ user, isDarkMode, setIsDarkMode, onLogout }) {
  const displayName = user?.name || 'Customer';
  const companyName = user?.company || user?.company_name || '';
  const designation = user?.job_role || (user?.is_team_member ? 'Authorized User' : 'Administrator');
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  const [showAddModal, setShowAddModal] = useState(false);

  const handleRequest = async (payload) => {
    await unifiedClient.requestTeamMember(payload);
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <section
        style={{
          padding: '18px',
          borderRadius: 'var(--radius-lg)',
          background: 'linear-gradient(135deg, #004898 0%, #002D62 100%)',
          boxShadow: '0 10px 25px rgba(0, 72, 152, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}
      >
        <div style={{ width: '62px', height: '62px', flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(255, 255, 255, 0.16)', border: '2px solid rgba(255, 255, 255, 0.3)', color: '#fff', fontSize: '20px', fontWeight: 800 }}>
          {initials || <UserRound size={26} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff', letterSpacing: '-0.2px', overflowWrap: 'anywhere' }}>
            {displayName}
          </h2>
          {designation && (
            <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.85)', marginTop: '1px' }}>
              {designation}
            </div>
          )}
          {companyName && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', marginTop: '6px', fontSize: '12px', fontWeight: 700, color: '#93C5FD' }}>
              <Building2 size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span style={{ overflowWrap: 'anywhere' }}>{companyName} (Shared Company Account)</span>
            </div>
          )}
        </div>
      </section>

      <section className="card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Users size={18} color="var(--color-primary)" />
          <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Authorized Team Members
          </span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
          Team members are set up by TaskTel. Send a request with the person's name, role and email, and TaskTel will create their access.
        </p>
        <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary" style={{ padding: '9px 14px', fontSize: '12px' }}>
          <Plus size={15} />
          <span>Request Authorized User</span>
        </button>
      </section>

      <section className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Dark mode</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Change the app appearance</div>
          </div>
        </div>
        <button type="button" aria-pressed={isDarkMode} onClick={() => setIsDarkMode(!isDarkMode)} style={{ width: '46px', height: '26px', border: 0, borderRadius: '13px', padding: '3px', background: isDarkMode ? 'var(--color-primary)' : 'var(--color-border)', cursor: 'pointer' }}>
          <span style={{ display: 'block', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transform: isDarkMode ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.2s' }} />
        </button>
      </section>

      <button type="button" onClick={onLogout} className="btn-secondary" style={{ width: '100%', padding: '13px', color: '#B42318', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
        <LogOut size={17} />
        Sign out
      </button>

      {showAddModal && (
        <AddTeamMemberModal onInvite={handleRequest} onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}
