// Tally Settings — the exact Tally names every voucher uses (company,
// ledgers, voucher types). Nothing reads Tally in Phase 1, so these are typed
// once by someone who has Tally open, and must match it letter for letter.
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { StateSelect } from '../common/StateSelect';
import { saveTallySettings } from '../../services/tallyApiService';
import { formatDateTime } from '../quotes/quoteShared';

const GROUPS = [
  ['Company', [
    ['company_name', 'Company name in Tally', 'e.g. TASKTEL TECHNOLOGEES PVT LTD', 'Optional. When set, Tally refuses the file unless this company is the one open — a guard against importing into the wrong company or a test copy.'],
    ['home_state', 'Our state (for GST)', '', 'Place of supply in this state → CGST + SGST. Any other state → IGST.'],
    ['godown_name', 'Godown', 'e.g. Main Location', 'Only if Tally keeps stock in godowns. Leave empty otherwise.']
  ]],
  ['Ledgers', [
    ['ledger_sales_goods', 'Sales ledger — goods', 'e.g. Sales @18%'],
    ['ledger_sales_services', 'Sales ledger — services', 'e.g. Installation Charges', 'Service lines are posted to this ledger (they are not stock items).'],
    ['ledger_cgst', 'Output CGST ledger', 'e.g. Output CGST'],
    ['ledger_sgst', 'Output SGST ledger', 'e.g. Output SGST'],
    ['ledger_igst', 'Output IGST ledger', 'e.g. Output IGST'],
    ['ledger_round_off', 'Round off ledger', 'e.g. Round Off', 'Optional. When set, invoices and proformas are rounded to the rupee.']
  ]],
  ['Voucher types', [
    ['vch_sales_order', 'Sales Order', 'Sales Order'],
    ['vch_proforma', 'Proforma', 'e.g. Profroma Invoice', 'Spelled exactly as in Tally, even if Tally has a typo.'],
    ['vch_delivery_note', 'Delivery Note (DC)', 'Delivery Note'],
    ['vch_invoice_goods', 'Sales Invoice — goods', 'Sales'],
    ['vch_invoice_services', 'Sales Invoice — services only', 'e.g. SERVICE - SALES', 'Optional. Used when an invoice has only service lines; otherwise the goods type is used.']
  ]]
];
const FIELDS = GROUPS.flatMap(([, fields]) => fields.map(([key]) => key));

export const TallySettingsPanel = ({ settings, onSaved, showToast }) => {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(settings); }, [settings]);
  const dirty = FIELDS.some((k) => (form[k] || '') !== (settings[k] || ''));

  const save = async () => {
    setSaving(true);
    try {
      const body = Object.fromEntries(FIELDS.map((k) => [k, form[k] || '']));
      onSaved(await saveTallySettings(body));
      showToast('Tally settings saved', 'success');
    } catch (err) { showToast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 flex items-start gap-3 text-xs text-[#7A2E0E]">
        <AlertTriangle className="w-4 h-4 text-[#DC6803] shrink-0 mt-0.5" />
        <p>
          <b>Type every name exactly as it appears in Tally</b> — same spelling, spaces and capitals. Open Tally
          (Chart of Accounts → Ledgers / Voucher Types) and copy them. A name that doesn't exist in Tally makes Tally
          reject the voucher. Ideally someone from Accounts fills this in.
        </p>
      </div>

      {GROUPS.map(([title, fields]) => (
        <div key={title} className="card bg-white border border-[#E4E7EC] shadow-xs p-5">
          <h3 className="font-extrabold text-sm text-[#172033] mb-4">{title}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map(([key, label, placeholder, hint]) => (
              <label key={key} className="block">
                <span className="text-[11px] font-bold text-[#344054]">{label}</span>
                {key === 'home_state' ? (
                  <div className="mt-1"><StateSelect value={form.home_state || ''} onChange={(v) => setForm({ ...form, home_state: v })} /></div>
                ) : (
                  <input value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
                    className="mt-1 w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-mono outline-none focus:border-[#004898]" />
                )}
                {hint && <span className="block text-[10px] text-[#667085] mt-1">{hint}</span>}
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-[#667085]">
          {settings.updated_by_name ? `Last saved by ${settings.updated_by_name} · ${formatDateTime(settings.updated_at)}` : ''}
        </p>
        <button onClick={save} disabled={!dirty || saving} className="btn btn-primary text-xs font-bold shadow-sm disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save settings
        </button>
      </div>
    </div>
  );
};
