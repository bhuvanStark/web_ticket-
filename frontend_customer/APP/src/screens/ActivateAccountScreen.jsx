import React, { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle, AlertCircle, UserRound } from 'lucide-react';
import { useForm } from '../hooks/useForm';
import { required, minLength, matches } from '../utils/validation/index.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export function ActivateAccountScreen({ token, onComplete }) {
  const [invite, setInvite] = useState(null);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenError, setTokenError] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const form = useForm(
    { password: '', confirmPassword: '' },
    {
      password: [required('Enter a password'), minLength(6)],
      confirmPassword: [required('Re-enter your password'), matches('password', 'Passwords do not match')],
    }
  );
  const { showError, field } = form;
  const isSubmitting = form.isSubmitting;

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setTokenError('This activation link is missing its token. Please use the link from your invitation email.');
        setIsValidating(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/team-members/activate/${token}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          setTokenError(data.error || 'This activation link is not valid.');
        } else {
          setInvite(data.data);
        }
      } catch (err) {
        setTokenError('Could not reach the server. Please check your connection and try again.');
      } finally {
        setIsValidating(false);
      }
    };

    validate();
  }, [token]);

  const handleSubmit = form.handleSubmit(async ({ password }) => {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/team-members/activate/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Could not activate your account. Please try again.');
        return;
      }

      setSuccess(true);
      setTimeout(() => onComplete?.(), 2000);
    } catch (err) {
      setError('Could not reach the server. Please check your connection and try again.');
    }
  });

  if (isValidating) {
    return (
      <CenteredMessage>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Checking your invitation...</p>
      </CenteredMessage>
    );
  }

  if (tokenError) {
    return (
      <CenteredMessage>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#FEE2E2', color: '#B91C1C', display: 'grid', placeItems: 'center', marginBottom: '14px' }}>
          <AlertCircle size={34} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
          Invitation Unavailable
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 20px' }}>{tokenError}</p>
        <button type="button" onClick={onComplete} className="btn-secondary">
          Go to Sign In
        </button>
      </CenteredMessage>
    );
  }

  if (success) {
    return (
      <CenteredMessage>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-success-bg)', color: 'var(--color-success, #067647)', display: 'grid', placeItems: 'center', marginBottom: '14px' }}>
          <CheckCircle size={34} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
          Account Activated!
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          You can now sign in with {invite?.email}. Redirecting...
        </p>
      </CenteredMessage>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%', padding: '24px 20px', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', overflowY: 'auto' }}>
      <div style={{ marginBottom: '24px', marginTop: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
          Activate Your Account
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          Set a password to finish setting up your TaskTel access.
        </p>
      </div>

      <div className="card" style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '20px' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <UserRound size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{invite?.full_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{invite?.email}</div>
          {invite?.job_role && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{invite.job_role}</div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div style={{ padding: '12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>
            {error}
          </div>
        )}

        <PasswordField
          label="New Password"
          inputProps={field('password')}
          error={showError('password')}
          show={showPassword}
          onToggleShow={() => setShowPassword(!showPassword)}
          placeholder="At least 6 characters"
        />

        <PasswordField
          label="Confirm Password"
          inputProps={field('confirmPassword')}
          error={showError('confirmPassword')}
          show={showConfirmPassword}
          onToggleShow={() => setShowConfirmPassword(!showConfirmPassword)}
          placeholder="Re-enter your password"
        />

        <button type="submit" disabled={isSubmitting} className="btn-primary" style={{ marginTop: '8px' }}>
          <span>{isSubmitting ? 'Activating...' : 'Set Password & Activate'}</span>
          <ArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}

function PasswordField({ label, inputProps, error, show, onToggleShow, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
        <input
          type={show ? 'text' : 'password'}
          {...inputProps}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          style={{ width: '100%', padding: '12px 40px', borderRadius: '8px', border: `1px solid ${error ? '#DC2626' : 'var(--color-border)'}`, background: 'var(--color-surface)', fontSize: '14px', outline: 'none', color: 'var(--color-text-primary)' }}
        />
        <button
          type="button"
          onClick={onToggleShow}
          style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && (
        <div role="alert" style={{ marginTop: '5px', fontSize: '11px', fontWeight: 600, color: '#DC2626' }}>{error}</div>
      )}
    </div>
  );
}

function CenteredMessage({ children }) {
  return (
    <div style={{ height: '100%', width: '100%', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: 'var(--color-bg)' }}>
      {children}
    </div>
  );
}
