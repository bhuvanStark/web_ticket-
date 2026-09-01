import React, { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import unifiedClient from '../../api/unifiedClient';
import { useForm } from '../../hooks/useForm';
import { required, minLength, matches } from '../../utils/validation';

export const AdminResetPasswordScreen = ({ token, onDone }) => {
  const [email, setEmail] = useState('');
  const [isValidating, setIsValidating] = useState(true);
  const [tokenError, setTokenError] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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
      setTimeout(() => onDone?.(), 2200);
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Could not reset your password. Please try again.');
    }
  });

  return (
    <div className="min-h-screen bg-[#001B3D] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-[#E4E7EC] p-6">
        {isValidating ? (
          <p className="text-xs text-[#667085] text-center py-6">Checking your reset link…</p>
        ) : tokenError ? (
          <div className="text-center space-y-3">
            <AlertCircle className="w-12 h-12 text-[#B42318] mx-auto" />
            <h3 className="text-lg font-extrabold text-[#172033]">Link Unavailable</h3>
            <p className="text-xs text-[#667085]">{tokenError}</p>
            <button
              type="button"
              onClick={onDone}
              className="w-full py-2.5 bg-[#004898] text-white font-bold text-xs rounded-xl hover:bg-[#003673] cursor-pointer"
            >
              Back to Sign In
            </button>
          </div>
        ) : success ? (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#12B76A] mx-auto" />
            <h3 className="text-lg font-extrabold text-[#172033]">Password Updated</h3>
            <p className="text-xs text-[#667085]">You can now sign in with your new password. Redirecting…</p>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-extrabold text-[#172033] mb-1">Create New Password</h3>
            <p className="text-xs text-[#667085] mb-5">
              {email ? `Setting a new password for ${email}.` : 'Choose a new secure password.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-[#FEE2E2] border border-[#FCA5A5] rounded-xl text-[11px] font-semibold text-[#B91C1C]">
                  {error}
                </div>
              )}

              <PasswordInput
                label="New Password"
                inputProps={field('password')}
                error={showError('password')}
                show={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
                placeholder="At least 6 characters"
              />

              <PasswordInput
                label="Confirm Password"
                inputProps={field('confirmPassword')}
                error={showError('confirmPassword')}
                show={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
                placeholder="Re-enter your password"
              />

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-[#004898] text-white font-bold text-xs rounded-xl shadow-xs hover:bg-[#003673] cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>{isSubmitting ? 'Saving…' : 'Save Password'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

const PasswordInput = ({ label, inputProps, error, show, onToggle, placeholder }) => (
  <div>
    <label className="text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-1.5 block">{label}</label>
    <div className="relative">
      <Lock className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type={show ? 'text' : 'password'}
        {...inputProps}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`w-full pl-9 pr-9 py-2.5 bg-[#F8FAFC] border rounded-xl text-xs outline-none ${error ? 'border-[#DC2626] focus:border-[#DC2626]' : 'border-[#E4E7EC] focus:border-[#004898]'}`}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#98A2B3] hover:text-[#667085] cursor-pointer"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
    {error && <div className="mt-1.5 text-[11px] font-semibold text-[#DC2626]">{error}</div>}
  </div>
);
