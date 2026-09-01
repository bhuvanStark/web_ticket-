import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Tv, Shield, HardHat, Mail, ArrowRight } from 'lucide-react';
import unifiedClient from '../../api/unifiedClient';

// Both portals (Admin and Technician) sign in by emailed OTP only — no password.
// Enter your work email, receive a 4-digit code, enter the code. The backend
// checks the email against the admins / technicians table and only emails a
// code if it finds one.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LoginScreen = () => {
  const { handleOtpLogin } = useApp();
  const [selectedRole, setSelectedRole] = useState('admin');

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [formError, setFormError] = useState('');

  // 'email' = enter your address. 'otp' = enter the 4-digit code.
  const [step, setStep] = useState('email');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const otpRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const otp = otpDigits.join('');

  const roleKey = selectedRole === 'tech' ? 'technician' : 'admin';
  const emailIsValid = (v) => EMAIL_REGEX.test((v || '').trim());

  const handleQuickRoleSelect = (roleType) => {
    setSelectedRole(roleType);
    setFormError('');
    setEmailError('');
    setStep('email');
    setOtpDigits(['', '', '', '']);
  };

  const handleEmailChange = (value) => {
    setEmail(value);
    setFormError('');
    if (emailError) setEmailError('');
  };

  // Step 1 → send the code, then move to the OTP step.
  const sendCode = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setFormError('');
    if (!emailIsValid(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setSending(true);
    try {
      await unifiedClient.requestOtp(roleKey, email.trim());
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
      await unifiedClient.requestOtp(roleKey, email.trim());
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

  // Step 2 → verify the code. handleOtpLogin flips the app into the logged-in
  // view on success.
  const verifyCode = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setFormError('');
    if (!/^\d{4}$/.test(otp)) {
      setFormError('Enter the 4-digit code sent to your email.');
      return;
    }
    setVerifying(true);
    try {
      await handleOtpLogin(selectedRole === 'tech' ? 'tech' : 'admin', email.trim(), otp);
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
    <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Subtle Accent pattern */}
      <div className="absolute top-0 left-0 w-full h-64 bg-[#004898] clip-path-banner"></div>

      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#E4E7EC] relative z-10 overflow-hidden">
        {/* Top Brand Header */}
        <div className="p-6 text-center bg-white border-b border-[#F2F4F7]">
          <div className="w-12 h-12 rounded-2xl bg-[#004898] text-white flex items-center justify-center mx-auto mb-3 shadow-md">
            <Tv className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-extrabold text-[#172033] tracking-tight">TaskTel AV Service Operations</h2>
          <p className="text-xs text-[#667085] mt-1">
            Enterprise Audio Visual service management &amp; field engineering portal.
          </p>
        </div>

        {/* Role Toggle Tabs */}
        <div className="px-6 pt-5">
          <label className="block text-xs font-bold text-[#667085] uppercase tracking-wider mb-2">
            Select Login Portal View
          </label>
          <div className="grid grid-cols-2 gap-2 bg-[#F6F8FB] p-1.5 rounded-xl border border-[#E4E7EC]">
            <button
              type="button"
              onClick={() => handleQuickRoleSelect('admin')}
              className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                selectedRole === 'admin'
                  ? 'bg-[#004898] text-white shadow-xs'
                  : 'text-[#667085] hover:text-[#172033]'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Admin / Coordinator</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickRoleSelect('tech')}
              className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                selectedRole === 'tech'
                  ? 'bg-[#004898] text-white shadow-xs'
                  : 'text-[#667085] hover:text-[#172033]'
              }`}
            >
              <HardHat className="w-4 h-4" />
              <span>Technician Portal</span>
            </button>
          </div>
        </div>

        {/* Form Body — email + emailed code only. The account roster is
            deliberately not listed here. */}
        <form onSubmit={step === 'otp' ? verifyCode : sendCode} className="p-6 space-y-4">
          {formError && (
            <div className="p-3 bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg text-[11px] font-semibold text-[#B91C1C]">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#172033] mb-1.5">
              {selectedRole === 'tech' ? 'Technician Work Email' : 'Work Email Address'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#98A2B3] absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                readOnly={step === 'otp'}
                aria-invalid={Boolean(emailError)}
                className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-xs font-semibold text-[#172033] outline-none ${step === 'otp' ? 'bg-[#F6F8FB]' : 'bg-white'} ${emailError ? 'border-[#DC2626] focus:border-[#DC2626]' : 'border-[#E4E7EC] focus:border-[#004898]'}`}
                placeholder="name@company.com"
              />
            </div>
            {emailError && (
              <div className="mt-1.5 text-[11px] font-semibold text-[#DC2626]">{emailError}</div>
            )}
          </div>

          {step === 'otp' && (
            <div>
              <label className="block text-xs font-bold text-[#172033] mb-1">Enter OTP</label>
              <p className="text-[11px] text-[#667085] mb-2.5">Enter the 4-digit code sent to your email</p>
              <div className="flex gap-2.5">
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
                    className={`otp-input w-12 h-14 text-center text-xl font-extrabold bg-white border rounded-lg text-[#172033] outline-none ${formError ? 'border-[#DC2626]' : 'border-[#E4E7EC] focus:border-[#004898]'}`}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'otp' && (
            <div className="flex items-center justify-end mt-3 mb-4">
              <button
                type="button"
                onClick={handleResend}
                disabled={sending}
                className={`text-xs font-bold bg-transparent border-none p-0 ${sending ? 'text-[#98A2B3] cursor-default' : 'text-[#004898] hover:underline cursor-pointer'}`}
              >
                {sending ? 'Sending…' : 'Resend OTP'}
              </button>
            </div>
          )}

          {step === 'email' ? (
            <button
              type="submit"
              disabled={sending}
              className="w-full py-3 bg-[#004898] hover:bg-[#003673] text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <span>{sending ? 'Sending code…' : 'Send OTP'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                type="submit"
                disabled={verifying || otp.length !== 4}
                className="w-full py-3 bg-[#004898] hover:bg-[#003673] text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <span>{verifying ? 'Verifying…' : 'Verify OTP'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={backToEmail}
                className="w-full text-xs font-semibold text-[#667085] hover:text-[#172033] bg-transparent border-none cursor-pointer mt-2"
              >
                Use a different email
              </button>
            </>
          )}
        </form>

        {/* Footer info */}
        <div className="p-4 bg-[#F8FAFC] border-t border-[#E4E7EC] text-center text-xs text-[#667085]">
          Single Management Platform for TaskTel AV Enterprise Ops
        </div>
      </div>
    </div>
  );
};
