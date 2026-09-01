import React, { useState } from 'react';
import { X, UserCheck, CheckCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { validateForm, required, email as emailRule, phone as phoneRule, minLength } from '../../utils/validation';

const FieldError = ({ children }) =>
  children ? <p className="mt-1 text-[11px] font-semibold text-[#DC2626]">{children}</p> : null;

const LOCATIONS = ['Bengaluru', 'Hyderabad', 'Chennai', 'Mumbai', 'Pune', 'Gurugram / Delhi NCR'];

export function NewTechnicianModal({ onClose, onAddTechnician }) {
  const { showToast } = useApp();

  const [fullName, setFullName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rules = {
    fullName: [required('Technician name is required'), minLength(2)],
    email: [required('Email is required'), emailRule()],
    phone: [required('Phone number is required'), phoneRule()],
  };
  const values = () => ({ fullName, email, phone });
  const markTouched = (n) => { setTouched((t) => ({ ...t, [n]: true })); setErrors(validateForm(values(), rules)); };
  const errFor = (n) => (touched[n] ? errors[n] : null);
  const inputCls = (n) =>
    `w-full px-3 py-2 border rounded-lg text-sm text-[#172033] outline-none ${
      errFor(n) ? 'border-[#DC2626] focus:border-[#DC2626]' : 'border-[#E4E7EC] focus:border-[#004898]'
    }`;

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    const found = validateForm(values(), rules);
    setErrors(found);
    setTouched({ fullName: true, email: true, phone: true });
    if (Object.keys(found).length > 0) {
      showToast('Please fix the highlighted fields.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddTechnician({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role_title: roleTitle.trim() || null,
        specialization: specialization.trim() || null,
        location: location || null,
      });
      showToast(`Onboarded technician "${fullName.trim()}".`, 'success');
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to create technician', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#004898] text-white flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-lg text-[#172033]">Onboard New Technician</h3>
          </div>
          <button onClick={onClose} className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Full Name *</label>
              <input
                type="text" value={fullName}
                onChange={(e) => { setFullName(e.target.value); if (touched.fullName) markTouched('fullName'); }}
                onBlur={() => markTouched('fullName')}
                placeholder="e.g. Manish Sharma"
                className={`${inputCls('fullName')} font-bold`}
              />
              <FieldError>{errFor('fullName')}</FieldError>
            </div>
            <div>
              <label className="form-label">Role Title</label>
              <input
                type="text" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g. Senior AV Field Engineer"
                className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm text-[#172033] outline-none focus:border-[#004898]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Email *</label>
              <input
                type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); if (touched.email) markTouched('email'); }}
                onBlur={() => markTouched('email')}
                placeholder="name@company.com"
                className={inputCls('email')}
              />
              <FieldError>{errFor('email')}</FieldError>
            </div>
            <div>
              <label className="form-label">Phone *</label>
              <input
                type="text" value={phone}
                onChange={(e) => { setPhone(e.target.value); if (touched.phone) markTouched('phone'); }}
                onBlur={() => markTouched('phone')}
                placeholder="+91 98765 11223"
                className={inputCls('phone')}
              />
              <FieldError>{errFor('phone')}</FieldError>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Specialization</label>
              <input
                type="text" value={specialization} onChange={(e) => setSpecialization(e.target.value)}
                placeholder="e.g. Crestron, Logitech, EPABX"
                className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm text-[#172033] outline-none focus:border-[#004898]"
              />
            </div>
            <div>
              <label className="form-label">Location</label>
              <select
                value={location} onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm font-semibold text-[#172033] outline-none focus:border-[#004898]"
              >
                {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E4E7EC] flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary disabled:opacity-70">
              <CheckCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Onboarding…' : 'Onboard Technician'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
