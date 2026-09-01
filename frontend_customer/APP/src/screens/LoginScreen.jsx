import React, { useState, useRef } from 'react';
import { Shield, Mail, ArrowRight } from 'lucide-react';
import unifiedClient from '../api/unifiedClient';

// The customer portal has no password. Sign-in is: enter your email, receive a
// 4-digit code, enter the code. The backend checks the email against the
// customers and team_members tables and only emails a code if it finds one.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [formError, setFormError] = useState('');

  // 'email' = enter your address. 'otp' = enter the 4-digit code.
  const [step, setStep] = useState('email');
  const [sending, setSending] = useState(false);

  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const otpRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const otp = otpDigits.join('');

  const emailIsValid = (v) => EMAIL_REGEX.test((v || '').trim());

  const handleEmailChange = (value) => {
    setEmail(value);
    setFormError('');
    if (emailError) setEmailError('');
  };

  // Step 1 → send the code, then move to the OTP step.
  const sendCode = async () => {
    setFormError('');
    if (!emailIsValid(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setSending(true);
    try {
      await unifiedClient.requestLoginOtp(email.trim());
      setStep('otp');
      setOtpDigits(['', '', '', '']);
      setTimeout(() => otpRefs[0].current?.focus(), 50);
    } catch (err) {
      setFormError(err?.data?.error || err?.message || 'Could not send the code. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleResend = async () => {
    if (sending) return;
    setFormError('');
    setSending(true);
    try {
      await unifiedClient.requestLoginOtp(email.trim());
      setOtpDigits(['', '', '', '']);
      otpRefs[0].current?.focus();
    } catch (err) {
      setFormError(err?.data?.error || err?.message || 'Could not resend the code.');
    } finally {
      setSending(false);
    }
  };

  const setDigit = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    setFormError('');
    if (digit && index < 3) otpRefs[index + 1].current?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
    if (!text) return;
    e.preventDefault();
    const next = ['', '', '', ''];
    for (let i = 0; i < text.length; i += 1) next[i] = text[i];
    setOtpDigits(next);
    otpRefs[Math.min(text.length, 3)].current?.focus();
  };

  // Step 2 → verify the code. On success the user is signed in.
  const verifyCode = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setFormError('');
    if (!/^\d{4}$/.test(otp)) {
      setFormError('Enter the 4-digit code sent to your email.');
      return;
    }
    setVerifying(true);
    try {
      const response = await unifiedClient.verifyLoginOtp(email.trim(), otp);
      const account = response.data.customer;
      onLogin({
        ...account,
        company: account.company_name || '',
        role: 'Customer'
      });
    } catch (err) {
      setFormError(err?.data?.error || err?.message || 'That code is incorrect or has expired.');
    } finally {
      setVerifying(false);
    }
  };

  const backToEmail = () => {
    setStep('email');
    setFormError('');
    setOtpDigits(['', '', '', '']);
  };

  return (
    <div style={{
      height: '100%',
      width: '100%',
      padding: '24px 20px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      background: 'var(--color-bg)',
      overflowY: 'auto'
    }}>
      <div>
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF'
          }}>
            <Shield size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)' }}>TaskTel</h2>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Enterprise AV Support</p>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {step === 'email'
              ? 'Enter your email and we’ll send you a sign-in code'
              : `Enter the 4-digit code sent to ${email}`}
          </p>
        </div>

        <form onSubmit={step === 'otp' ? verifyCode : (e) => { e.preventDefault(); sendCode(); }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {formError && (
            <div style={{ padding: '12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
              {formError}
            </div>
          )}

          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              Corporate Email / Account
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder="name@company.com"
                aria-invalid={Boolean(emailError)}
                autoComplete="username"
                readOnly={step === 'otp'}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 40px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${emailError ? '#DC2626' : 'var(--color-border)'}`,
                  background: step === 'otp' ? 'var(--color-bg)' : 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
            {emailError && <FieldError message={emailError} />}
          </div>

          {step === 'email' ? (
            <button type="submit" className="btn-primary" disabled={sending} style={{ marginTop: '4px', opacity: sending ? 0.7 : 1 }}>
              <span>{sending ? 'Sending code…' : 'Send OTP'}</span>
              <ArrowRight size={18} />
            </button>
          ) : (
            <>
              {/* OTP entry */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                  Enter OTP
                </label>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
                  Enter the 4-digit code sent to your email
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={otpRefs[i]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onPaste={handleOtpPaste}
                      style={{
                        width: '56px', height: '56px', textAlign: 'center',
                        fontSize: '22px', fontWeight: 800,
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${formError ? '#DC2626' : 'var(--color-border)'}`,
                        background: 'var(--color-surface)', color: 'var(--color-text-primary)',
                        outline: 'none'
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: '12px' }}>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={sending}
                  style={{
                    background: 'none', border: 'none', fontWeight: '700',
                    color: sending ? 'var(--color-text-tertiary)' : 'var(--color-primary)',
                    cursor: sending ? 'default' : 'pointer'
                  }}
                >
                  {sending ? 'Sending…' : 'Resend OTP'}
                </button>
              </div>

              <button type="submit" className="btn-primary" disabled={verifying || otp.length !== 4} style={{ marginTop: '4px', opacity: (verifying || otp.length !== 4) ? 0.7 : 1 }}>
                <span>{verifying ? 'Verifying…' : 'Verify OTP'}</span>
                <ArrowRight size={18} />
              </button>

              <button
                type="button"
                onClick={backToEmail}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginTop: '2px' }}
              >
                Use a different email
              </button>
            </>
          )}
        </form>

        </div>

      <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '16px' }}>
        TaskTel Enterprise Portal v2.4 • Secure PostgreSQL-backed service platform
      </div>
    </div>
  );
}

function FieldError({ message }) {
  return (
    <div role="alert" style={{ marginTop: '5px', fontSize: '11px', fontWeight: 600, color: '#DC2626' }}>
      {message}
    </div>
  );
}
