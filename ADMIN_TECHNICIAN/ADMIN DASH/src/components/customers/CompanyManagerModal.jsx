import React, { useState, useEffect } from 'react';
import { X, Building2, Loader2, Info, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import unifiedClient from '../../api/unifiedClient';

/**
 * Companies are not stored in their own table — they are the distinct
 * company_name values on customer records. This view is therefore read-only:
 * a company appears here once a customer belongs to it, and the code shown is
 * derived from the name.
 */
export function CompanyManagerModal({ onClose }) {
  const { showToast } = useApp();
  const [companies, setCompanies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const res = await unifiedClient.getCompanies();
        setCompanies(res.data || []);
      } catch (err) {
        const message = err?.data?.error || err?.message || 'Could not load companies.';
        setError(message);
        showToast(message, 'error');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [showToast]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#004898] text-white flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-[#172033]">Companies</h3>
              <p className="text-[11px] text-[#667085]">Corporate clients currently on the platform</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4 text-xs">

          <div className="flex items-start gap-2 p-3 bg-[#EFF5FC] border border-[#B3D1F2] rounded-xl text-[11px] text-[#004898]">
            <Info className="w-4 h-4 shrink-0 mt-px" />
            <span>
              A company appears here automatically once a customer account is created under it.
              To add one, onboard a customer with that company name.
            </span>
          </div>

          {error && (
            <div className="p-3 bg-[#FEE2E2] border border-[#FCA5A5] rounded-xl text-[11px] font-semibold text-[#B91C1C]">
              {error}
            </div>
          )}

          <div className="border border-[#E4E7EC] rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC] text-[11px] font-bold text-[#667085] uppercase tracking-wider">
                  <th className="px-4 py-3">Company Name</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Accounts</th>
                  <th className="px-4 py-3">First Onboarded</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan="4" className="text-center py-6 text-[#667085]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
                ) : companies.length === 0 ? (
                  <tr><td colSpan="4" className="text-center py-6 text-[#667085]">No companies yet. Onboard a customer to create one.</td></tr>
                ) : (
                  companies.map((comp) => (
                    <tr key={comp.id} className="border-b border-[#E4E7EC] last:border-0 hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 font-bold text-[#172033]">{comp.company_name}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[#004898] bg-[#004898]/10 rounded px-2 py-0.5">{comp.company_code}</span>
                      </td>
                      <td className="px-4 py-3 text-[#667085]">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {comp.account_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#667085]">
                        {comp.created_at ? new Date(comp.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && companies.length > 0 && (
            <p className="text-[11px] text-[#667085]">
              {companies.length} {companies.length === 1 ? 'company' : 'companies'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
