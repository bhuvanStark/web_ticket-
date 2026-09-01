import React, { useState } from 'react';
import { Users, X, Send, Mail } from 'lucide-react';
import { useForm } from '../hooks/useForm';
import { required, email as emailRule, minLength } from '../utils/validation/index.js';

export function AddTeamMemberModal({ onInvite, onClose }) {
  const [jobRole, setJobRole] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const form = useForm(
    { fullName: '', email: '' },
    {
      fullName: [required('Full name is required'), minLength(2)],
      email: [required('Work email is required'), emailRule()],
    }
  );
  const { showError, field } = form;
  const isSubmitting = form.isSubmitting;

  const handleSubmit = form.handleSubmit(async ({ fullName, email }) => {
    setError('');
    try {
      await onInvite({
        full_name: fullName.trim(),
        email: email.trim(),
        job_role: jobRole.trim(),
      });
      setSent(true);
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Failed to send request. Please try again.');
    }
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={20} color="var(--color-primary)" />
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
              Request Authorized User
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '12px 14px',
              borderRadius: 'var(--radius-md)', background: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: '13px'
            }}>
              <Mail size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>Your request has been sent to TaskTel. They will set up the account and the member will receive access.</span>
            </div>
            <button type="button" onClick={onClose} className="btn-primary" style={{ width: '100%' }}>Done</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Field label="Full Name *">
              <input
                type="text"
                {...field('fullName')}
                placeholder="e.g. Vikram Singh"
                aria-invalid={Boolean(showError('fullName'))}
                style={{ ...inputStyle, border: `1px solid ${showError('fullName') ? '#DC2626' : 'var(--color-border)'}` }}
              />
              {showError('fullName') && <FieldError message={showError('fullName')} />}
            </Field>

            <Field label="Role / Title">
              <input
                type="text"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                placeholder="e.g. AV & Workplace Specialist"
                style={inputStyle}
              />
            </Field>

            <Field label="Work Email *">
              <input
                type="email"
                {...field('email')}
                placeholder="e.g. name@company.com"
                aria-invalid={Boolean(showError('email'))}
                style={{ ...inputStyle, border: `1px solid ${showError('email') ? '#DC2626' : 'var(--color-border)'}` }}
              />
              {showError('email') && <FieldError message={showError('email')} />}
            </Field>

            <div style={{
              display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px',
              borderRadius: 'var(--radius-md)', background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontSize: '12px'
            }}>
              <Mail size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>These details will be sent to TaskTel as a request. TaskTel sets up the account — no login is created directly.</span>
            </div>

            {error && (
              <div style={{ color: 'var(--color-danger, #B42318)', fontSize: '12px', fontWeight: 600 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button type="button" onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="btn-primary" style={{ flex: 1 }}>
                <Send size={16} />
                <span>{isSubmitting ? 'Sending...' : 'Send Request to TaskTel'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldError({ message }) {
  return (
    <span role="alert" style={{ fontSize: '11px', fontWeight: 600, color: '#DC2626' }}>{message}</span>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  fontSize: '13px',
  outline: 'none',
  color: 'var(--color-text-primary)'
};
