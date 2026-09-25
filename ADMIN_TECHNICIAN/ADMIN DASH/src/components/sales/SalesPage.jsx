// Sales & Back-Office Roles V1 — Admin management page for the Sales
// roster (plan §4). Deliberately self-contained (own fetch on mount, own
// modal state) rather than wired into AppContext's global technicians-style
// polling — Sales employees are never needed anywhere else in the app (not
// in ticket/project assignment dropdowns), so there's no reason for their
// roster to live in shared global state. Mirrors UserManagementPage's
// (Admin Roles) self-contained pattern more closely than TechniciansPage's
// context-driven one, for that reason — but the same fields/form style and
// Branch filter as the Technician page, per the plan.
import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, Plus, Pencil, Trash2, UserX, AlertTriangle, TrendingUp, X, CheckCircle } from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';
import { EMPLOYEE_LOCATIONS } from '../../utils/employeeLocations';
import { validateForm, required, email as emailRule, phone as phoneRule, minLength } from '../../utils/validation';
import {
  fetchSalesInApi, createSalesInApi, updateSalesInApi, deleteSalesInApi, deactivateSalesInApi
} from '../../services/salesApiService';
// TaskPro Sales Module V1 — Leads tab, additive alongside the roster tab below.
import { AdminLeadsTab } from './AdminLeadsTab';

const FieldError = ({ children }) =>
  children ? <p className="mt-1 text-[11px] font-semibold text-[#DC2626]">{children}</p> : null;

// Create/Edit form, inline rather than a separate globally-registered modal
// (see the file header comment) — opened either from "Add Sales" or a row's
// Edit action.
const SalesFormModal = ({ mode, employee, onClose, onSaved, showToast }) => {
  const isEdit = mode === 'edit';
  const [fullName, setFullName] = useState(employee?.full_name || '');
  const [email, setEmail] = useState(employee?.email || '');
  const [phone, setPhone] = useState(employee?.phone || '');
  const [location, setLocation] = useState(employee?.location || EMPLOYEE_LOCATIONS[0]);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rules = {
    fullName: [required('Name is required'), minLength(2)],
    email: [required('Email is required'), emailRule()],
    phone: [required('Phone number is required'), phoneRule()]
  };
  const values = () => ({ fullName, email, phone });
  const markTouched = (n) => { setTouched((t) => ({ ...t, [n]: true })); setErrors(validateForm(values(), rules)); };
  const errFor = (n) => (touched[n] ? errors[n] : null);
  const inputCls = (n) =>
    `w-full px-3 py-2 border rounded-lg text-sm text-[#172033] outline-none ${
      errFor(n) ? 'border-[#DC2626] focus:border-[#DC2626]' : 'border-[#E4E7EC] focus:border-[#004898]'
    }`;

  const handleSave = async (e) => {
    e.preventDefault();
    const found = validateForm(values(), rules);
    setErrors(found);
    setTouched({ fullName: true, email: true, phone: true });
    if (Object.keys(found).length > 0) {
      showToast('Please fix the highlighted fields.', 'error');
      return;
    }

    const payload = { full_name: fullName.trim(), email: email.trim(), phone: phone.trim(), location: location || null };
    setIsSubmitting(true);
    try {
      if (isEdit) await updateSalesInApi(employee.id, payload);
      else await createSalesInApi(payload);
      showToast(`Sales employee ${isEdit ? 'updated' : 'added'} successfully.`, 'success');
      onSaved();
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
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
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-lg text-[#172033]">{isEdit ? 'Edit Sales Employee' : 'Add Sales Employee'}</h3>
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white transition-all disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="form-label">Full Name *</label>
            <input
              type="text" value={fullName}
              onChange={(e) => { setFullName(e.target.value); if (touched.fullName) markTouched('fullName'); }}
              onBlur={() => markTouched('fullName')}
              placeholder="e.g. Priya Sharma"
              className={`${inputCls('fullName')} font-bold`}
            />
            <FieldError>{errFor('fullName')}</FieldError>
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

          <div>
            <label className="form-label">Branch</label>
            <select
              value={location} onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm font-semibold text-[#172033] outline-none focus:border-[#004898]"
            >
              {EMPLOYEE_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div className="pt-3 border-t border-[#E4E7EC] flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary disabled:opacity-70">
              <CheckCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Employee'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// TaskPro Sales Module V1 — the original SalesPage (Sales employee roster
// management, unchanged) is now one tab of two; renamed so the exported
// SalesPage below can host both without moving or rewriting this component.
const SalesRosterTab = () => {
  const { showToast } = useApp();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'create' | 'edit', employee? }
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchSalesInApi();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast?.(err.message || 'Could not load Sales roster', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const branches = [...new Set(employees.map((e) => e.location).filter(Boolean))].sort();
  const filtered = employees.filter((e) =>
    (!branchFilter || e.location === branchFilter) &&
    ((e.full_name || '').toLowerCase().includes(search.toLowerCase()) || (e.email || '').toLowerCase().includes(search.toLowerCase()))
  );

  const confirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteSalesInApi(pendingDelete.id);
      showToast?.(`${pendingDelete.full_name} and their attendance history were deleted.`, 'success');
      setPendingDelete(null);
      load();
    } catch (err) {
      showToast?.(err.message || 'Delete failed', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Safe alternative to Delete: keeps the employee row and all of their
  // attendance history, just removes them from the active roster.
  const handleDeactivate = async (employee) => {
    if (deactivatingId) return;
    if (!window.confirm(`Deactivate ${employee.full_name}? They will be removed from the active roster, but their record and attendance history are kept.`)) return;
    setDeactivatingId(employee.id);
    try {
      await deactivateSalesInApi(employee.id);
      showToast?.(`${employee.full_name} deactivated.`, 'success');
      load();
    } catch (err) {
      showToast?.(err.message || 'Deactivate failed', 'error');
    } finally {
      setDeactivatingId(null);
    }
  };

  if (loading) return <TableSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Sales Roster</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">Manage Sales employees and their branch assignment.</p>
        </div>
        <button onClick={() => setModal({ mode: 'create' })} className="btn btn-primary shadow-sm text-xs font-bold">
          <Plus className="w-4 h-4" />
          <span>Add Sales Employee</span>
        </button>
      </div>

      <div className="card p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#E4E7EC] shadow-xs">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '40px' }}
            className="form-input text-xs"
          />
        </div>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="text-xs font-semibold text-[#172033] border border-[#E4E7EC] rounded-lg px-3 py-2 bg-white outline-none focus:border-[#004898] cursor-pointer shrink-0"
        >
          <option value="">All Branches</option>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="text-xs font-bold text-[#004898] bg-[#EFF5FC] px-3 py-1.5 rounded-lg border border-[#B3D1F2] shrink-0">
          Total Sales Employees: {filtered.length}
        </div>
      </div>

      <div className="card overflow-hidden border border-[#E4E7EC] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse bg-white">
            <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
              <tr>
                <th className="px-6 py-4 text-left">Name</th>
                <th className="px-6 py-4 text-left">Phone</th>
                <th className="px-6 py-4 text-left">Branch</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {filtered.length === 0 ? (
                <tr><td colSpan="4" className="p-8 text-center text-[#667085]">No Sales employees match the selected filters.</td></tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-[#F8FAFC] transition-all">
                    <td className="px-6 py-4 align-middle">
                      <div className="font-extrabold text-[13px] text-[#172033]">{e.full_name}</div>
                      <div className="text-[11px] text-[#667085]">{e.email}</div>
                    </td>
                    <td className="px-6 py-4 align-middle text-[#475467] font-medium">{e.phone || '—'}</td>
                    <td className="px-6 py-4 align-middle text-[#475467] font-medium">{e.location || '—'}</td>
                    <td className="px-6 py-4 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setModal({ mode: 'edit', employee: e })}
                          className="p-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#172033] border border-[#E4E7EC] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeactivate(e)}
                          disabled={deactivatingId === e.id}
                          className="p-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#475467] border border-[#E4E7EC] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center disabled:opacity-60"
                          title="Deactivate (keeps record and attendance history)"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setPendingDelete(e)}
                          className="p-1.5 rounded-lg bg-white hover:bg-[#FEF3F2] text-[#D92D20] border border-[#E4E7EC] hover:border-[#FDA29B] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <SalesFormModal
          mode={modal.mode}
          employee={modal.employee}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
          showToast={showToast}
        />
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[#E4E7EC]">
            <div className="flex items-start gap-3 p-5">
              <div className="shrink-0 w-10 h-10 rounded-full bg-[#FEF3F2] flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#D92D20]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#172033]">Delete Sales employee</h3>
                <p className="mt-1 text-sm text-[#667085]">
                  This will permanently remove <span className="font-semibold text-[#172033]">{pendingDelete.full_name}</span> <span className="font-semibold text-[#D92D20]">and permanently delete all of their attendance history</span>. This cannot be undone. To keep their record and history, use Deactivate instead.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] rounded-b-xl">
              <button onClick={() => setPendingDelete(null)} disabled={isDeleting} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC] transition-all cursor-pointer disabled:opacity-60">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={isDeleting} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#D92D20] text-white hover:bg-[#B42318] transition-all cursor-pointer disabled:opacity-60">
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// TaskPro Sales Module V1 (plan §2/§8) — the 'sales' admin nav item now
// covers both the Sales roster (unchanged, above) and Leads. One page, two
// tabs, both gated by the same admin_permissions 'sales' module already —
// there is no separate permission for Leads vs Roster.
export const SalesPage = () => {
  const [tab, setTab] = useState('leads');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 border-b border-[#E4E7EC]">
        {[
          { id: 'leads', label: 'Leads' },
          { id: 'roster', label: 'Sales Team' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors -mb-px ${
              tab === t.id ? 'border-[#004898] text-[#004898]' : 'border-transparent text-[#667085] hover:text-[#172033]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'leads' ? <AdminLeadsTab /> : <SalesRosterTab />}
    </div>
  );
};
