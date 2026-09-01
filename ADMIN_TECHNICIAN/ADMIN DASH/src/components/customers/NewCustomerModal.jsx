import React, { useState } from 'react';
import { X, Building2, UserCheck, CheckCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { createAdminCustomer } from '../../services/adminApiService';
import { validateForm, required, email as emailRule, phone as phoneRule, minLength } from '../../utils/validation';

const FieldError = ({ children }) =>
  children ? <p className="mt-1 text-[11px] font-semibold text-[#DC2626]">{children}</p> : null;

export function NewCustomerModal({ onClose, onAddCustomer }) {
  const { showToast } = useApp();

  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rules = {
    companyName: [required('Company name is required'), minLength(2)],
    contactPerson: [required('Contact name is required'), minLength(2)],
    email: [required('Email is required'), emailRule()],
    phone: [required('Phone number is required'), phoneRule()],
  };
  const values = () => ({ companyName, contactPerson, email, phone });
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
    setTouched({ companyName: true, contactPerson: true, email: true, phone: true });
    if (Object.keys(found).length > 0) {
      showToast('Please fix the highlighted fields.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createAdminCustomer({
        company_name: companyName.trim(),
        name: contactPerson.trim(),
        contact_person: contactPerson.trim(),
        contact_role: contactRole.trim() || null,
        email: email.trim(),
        phone: phone.trim(),
        industry: industry.trim() || null,
        city: city.trim() || null,
      });
      const row = created?.data || created;
      if (row) {
        row.contactPerson = row.contact_person;
        onAddCustomer(row);
      }
      showToast(`Onboarded "${companyName.trim()}".`, 'success');
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to create customer', 'error');
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
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-lg text-[#172033]">Onboard New Client</h3>
          </div>
          <button onClick={onClose} className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="space-y-4">
            <h4 className="font-extrabold text-[#172033] border-b border-[#E4E7EC] pb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#004898]" /> Company
            </h4>

            <div>
              <label className="form-label">Company Name *</label>
              <input
                type="text" value={companyName}
                onChange={(e) => { setCompanyName(e.target.value); if (touched.companyName) markTouched('companyName'); }}
                onBlur={() => markTouched('companyName')}
                placeholder="e.g. Acme Corp"
                className={`${inputCls('companyName')} font-bold`}
              />
              <FieldError>{errFor('companyName')}</FieldError>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Industry</label>
                <input
                  type="text" value={industry} onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Enterprise AV"
                  className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm text-[#172033] outline-none focus:border-[#004898]"
                />
              </div>
              <div>
                <label className="form-label">Headquarters City</label>
                <input
                  type="text" value={city} onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Bengaluru"
                  className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm text-[#172033] outline-none focus:border-[#004898]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-extrabold text-[#172033] border-b border-[#E4E7EC] pb-2 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#004898]" /> Primary Contact
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Contact Full Name *</label>
                <input
                  type="text" value={contactPerson}
                  onChange={(e) => { setContactPerson(e.target.value); if (touched.contactPerson) markTouched('contactPerson'); }}
                  onBlur={() => markTouched('contactPerson')}
                  placeholder="e.g. Vikram Malhotra"
                  className={`${inputCls('contactPerson')} font-semibold`}
                />
                <FieldError>{errFor('contactPerson')}</FieldError>
              </div>
              <div>
                <label className="form-label">Role / Designation</label>
                <input
                  type="text" value={contactRole} onChange={(e) => setContactRole(e.target.value)}
                  placeholder="e.g. IT Director"
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
                  placeholder="+91 98450 12345"
                  className={inputCls('phone')}
                />
                <FieldError>{errFor('phone')}</FieldError>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E4E7EC] flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl border border-[#E4E7EC] bg-white text-[#475467] font-bold text-xs hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-[#004898] text-white font-bold text-xs flex items-center gap-2 hover:bg-[#003673] disabled:opacity-70 shadow-md">
              <CheckCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Onboarding…' : 'Onboard Client'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
