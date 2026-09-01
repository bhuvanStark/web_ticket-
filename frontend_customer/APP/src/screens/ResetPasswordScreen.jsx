import React, { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import unifiedClient from '../api/unifiedClient';
import { useForm } from '../hooks/useForm';
import { required, minLength, matches } from '../utils/validation/index.js';

export function ResetPasswordScreen({ token, onComplete }) {
  const [email, setEmail] = useState('');
  const [isValidating, setIsValidating] = useState(true);
  const [tokenError, setTokenError] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const form = useForm(
    { password: '', confirmPassword: '' },
    {
      password: [required('Enter a new password'), minLength(6)],
      confirmPassword: [required('Re-enter your password'), matches('password', 'Passwords do not match')],
    }
  );
  const { showError, field } = form;
  const isSubmitting = form.isSubmitting;

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setTokenError('This reset link is missing its token. Please use the link from your email.');
        setIsValidating(false);
        return;
      }

      try {
        const res = await unifiedClient.verifyPasswordResetToken(token);
        setEmail(res.data?.email || '');
      } catch (err) {
        setTokenError(err?.data?.error || 'This reset link is not valid or has expired.');
      } finally {
        setIsValidating(false);
      }
    };

    validate();
  }, [token]);

  const handleSubmit = form.handleSubmit(async ({ password }) => {
    setError('');
    try {
      await unifiedClient.confirmPasswordReset(token, password);
      setSuccess(true);
      setTimeout(() => onComplete?.(), 2000);
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Could not reset your password. Please try again.');
    }
  });

  if (isValidating) {
    return (
      <Centered>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Checking your reset link…</p>
      </Centered>
    );
  }

  if (tokenError) {
    return (
      <Centered>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#FEE2E2', color: '#B91C1C', display: 'grid', placeItems: 'center', marginBottom: '14px' }}>
          <AlertCircle size={34} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
          Link Unavailable
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 20px' }}>{tokenError}</p>
        <button type="button" onClick={onComplete} className="btn-secondary">Back to Sign In</button>
      </Centered>
    );
  }

  if (success) {
    return (
      <Centered>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-success-bg)', color: 'var(--color-success, #067647)', display: 'grid', placeItems: 'center', marginBottom: '14px' }}>
          <CheckCircle size={34} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
          Password Updated
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          You can now sign in with your new password. Redirecting…
        </p>
      </Centered>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%', padding: '24px 20px', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', overflowY: 'auto' }}>
      <div style={{ marginBottom: '24px', marginTop: '40px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
          Create New Password
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          {email ? `Setting a new password for ${email}.` : 'Please enter your new secure password below.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div style={{ padding: '12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
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
          <span>{isSubmitting ? 'Saving…' : 'Save Password'}</span>
          <ArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}

function PasswordField({ label, inputProps, error, show, onToggleShow, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '6px' }}>
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

function Centered({ children }) {
  return (
    <div style={{ height: '100%', width: '100%', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: 'var(--color-bg)' }}>
      {children}
    </div>
  );
}
