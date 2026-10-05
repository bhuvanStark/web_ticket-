import React, { useState } from 'react';
import { DuplicateWarningModal } from './LeadQuickActions';

// Runs a lead save; on a DUPLICATE_LEAD warning keeps the payload so the
// user can confirm and re-send it with confirm_duplicate. Shared by the
// Admin and Sales lead forms.
export function useDuplicateAwareSave(save, { onSaved, showToast }) {
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(null); // { payload, duplicates, message }

  const run = async (payload) => {
    if (saving) return;
    setSaving(true);
    try {
      await save(payload);
      setPending(null);
      onSaved();
    } catch (err) {
      if (err.code === 'DUPLICATE_LEAD' && !payload.confirm_duplicate) setPending({ payload, duplicates: err.duplicates || [], message: err.message });
      else showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const warning = pending && (
    <DuplicateWarningModal
      duplicates={pending.duplicates}
      {...(pending.message ? { message: pending.message } : {})}
      saving={saving}
      onEdit={() => setPending(null)}
      onContinue={() => run({ ...pending.payload, confirm_duplicate: true })}
    />
  );
  return { run, saving, warning };
}
