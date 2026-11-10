import React, { useState } from 'react';
import {
  ClipboardCheck, UploadCloud, Send, ShieldCheck, Check, AlertTriangle, Loader2, Eye, XCircle, BadgeCheck, CircleSlash
} from 'lucide-react';
import { submitProjectCompletion } from '../../../services/projectApiService';
import { FileUploadDialog } from './FileUploadDialog';
import { downloadProjectFile } from './projectFiles';
import { ReviewDialog } from './ReviewDialog';
import { fmtBytes, fmtDateTime, timeAgo } from './projectFormat';

// Completion: (1) upload the signed & sealed completion page, (2) a manager
// or admin submits -> Pending Approval, (3) a Super Admin approves
// (Completed) or rejects with a reason (back to Active).
export const CompletionTab = ({ data, onChanged, showToast }) => {
  const { project, files, access, activities, events } = data;
  const docs = files.filter((f) => f.category === 'completion');
  const [chosenId, setChosenId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState(null);

  const status = project.status;
  const open = status === 'Planning' || status === 'Active';
  const submittedDoc = files.find((f) => f.id === project.completion_file_id);
  const selected = docs.find((f) => f.id === chosenId) || (open ? docs[0] : submittedDoc);
  const openWork = activities.filter((a) => a.status === 'Assigned' || a.status === 'Accepted').length;
  const history = events.filter((e) => ['submitted', 'approved', 'rejected'].includes(e.event_type));

  const step = status === 'Completed' ? 3 : status === 'Pending Approval' ? 2 : selected ? 1 : 0;

  const submit = async () => {
    if (!selected) return;
    if (!window.confirm(`Submit ${project.id} for completion approval with "${selected.display_name}"? Assignments are locked until a Super Admin decides.`)) return;
    setSubmitting(true);
    try {
      await submitProjectCompletion(project.id, selected.id);
      showToast('Sent to Super Admin for approval.', 'success');
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
      <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
        <StatusHero project={project} access={access} onReview={setReview} />

        <ol className="p-5 sm:p-6 space-y-0">
          <Step n={1} done={step >= 1} active={step === 0} title="Signed completion document" last={false}
            text="One page, signed and sealed by the customer — a PDF or a clear photo.">
            {open && docs.length > 1 && (
              <div className="space-y-1.5 mb-3">
                {docs.map((f) => (
                  <label key={f.id} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer ${selected?.id === f.id ? 'border-[#004898] bg-[#EFF5FC]' : 'border-[#E4E7EC] hover:border-[#B3D1F2]'}`}>
                    <input type="radio" name="completion-doc" checked={selected?.id === f.id} onChange={() => setChosenId(f.id)} className="accent-[#004898]" />
                    <span className="text-xs font-bold text-[#172033] flex-1 truncate">{f.display_name}</span>
                    <span className="text-[10px] text-[#98A2B3]">{timeAgo(f.created_at)}</span>
                  </label>
                ))}
              </div>
            )}
            {selected && <DocChip projectId={project.id} file={selected} showToast={showToast} />}
            {open && access.canManage && (
              <button onClick={() => setUploading(true)} className="mt-3 px-3.5 py-2 bg-white border border-[#E4E7EC] hover:bg-[#F8FAFC] text-[#004898] text-xs font-bold rounded-xl inline-flex items-center gap-2">
                <UploadCloud className="w-4 h-4" /> {docs.length ? 'Upload a new version' : 'Upload signed document'}
              </button>
            )}
            {open && !access.canManage && !docs.length && <p className="text-xs text-[#98A2B3]">A project manager uploads this.</p>}
          </Step>

          <Step n={2} done={step >= 2} active={step === 1} title="Submit for approval" last={false}
            text="The manager or an admin confirms the work is finished. Assignments lock while it waits.">
            {open ? (
              <>
                {openWork > 0 && (
                  <div className="mb-3 flex items-start gap-2 p-3 rounded-xl bg-[#FFFAEB] border border-[#FEDF89] text-[#B54708]">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="text-xs font-semibold">{openWork} daily assignment{openWork === 1 ? ' is' : 's are'} still open. Each needs to be completed (with its comment) or cancelled first.</p>
                  </div>
                )}
                {access.canManage ? (
                  <button
                    onClick={submit}
                    disabled={!selected || openWork > 0 || submitting}
                    className="px-4 py-2.5 bg-[#004898] hover:bg-[#003673] text-white text-xs font-extrabold rounded-xl shadow-xs inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Mark complete & send for approval
                  </button>
                ) : <p className="text-xs text-[#98A2B3]">Only this project&apos;s managers or an admin can submit.</p>}
              </>
            ) : (
              <p className="text-xs text-[#475467]">Submitted by <strong>{project.submitted_by_name || '—'}</strong> · {fmtDateTime(project.submitted_at)}</p>
            )}
          </Step>

          <Step n={3} done={step >= 3} active={step === 2} title="Super Admin approval" last
            text="Approved projects move to Completed. A rejection sends it back with the reason.">
            {status === 'Completed' && (
              <p className="text-xs text-[#027A48] font-semibold">Approved by {project.reviewed_by_name || 'Super Admin'} · {fmtDateTime(project.reviewed_at)}</p>
            )}
            {status === 'Pending Approval' && (access.canApprove ? (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setReview('approve')} className="px-4 py-2.5 bg-[#12B76A] hover:bg-[#039855] text-white text-xs font-extrabold rounded-xl inline-flex items-center gap-2"><Check className="w-4 h-4" /> Approve</button>
                <button onClick={() => setReview('reject')} className="px-4 py-2.5 bg-white border border-[#FDA29B] hover:bg-[#FEF3F2] text-[#B42318] text-xs font-extrabold rounded-xl inline-flex items-center gap-2"><XCircle className="w-4 h-4" /> Reject</button>
              </div>
            ) : <p className="text-xs text-[#B54708] font-semibold">Waiting for a Super Admin.</p>)}
          </Step>
        </ol>
      </div>

      <aside className="bg-white rounded-2xl border border-[#E4E7EC] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <h3 className="px-5 py-4 border-b border-[#F2F4F7] text-sm font-extrabold text-[#172033]">Approval history</h3>
        {history.length === 0 ? (
          <p className="px-5 py-6 text-xs text-[#98A2B3]">Nothing submitted yet.</p>
        ) : (
          <ul className="p-4 space-y-3">
            {history.map((e) => {
              const Icon = e.event_type === 'approved' ? BadgeCheck : e.event_type === 'rejected' ? CircleSlash : Send;
              const tone = e.event_type === 'approved' ? 'bg-[#ECFDF3] text-[#027A48]' : e.event_type === 'rejected' ? 'bg-[#FEF3F2] text-[#B42318]' : 'bg-[#FFFAEB] text-[#B54708]';
              return (
                <li key={e.id} className="flex gap-3">
                  <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center ${tone}`}><Icon className="w-3.5 h-3.5" /></span>
                  <div className="min-w-0">
                    <p className="text-xs text-[#344054] leading-snug break-words"><strong className="text-[#172033]">{e.actor_name || 'Someone'}</strong> — {e.message}</p>
                    <p className="text-[10px] text-[#98A2B3] mt-0.5">{fmtDateTime(e.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {uploading && (
        <FileUploadDialog
          projectId={project.id}
          initialCategory="completion"
          lockCategory
          onClose={() => setUploading(false)}
          onUploaded={(f) => { setUploading(false); setChosenId(f?.id || null); showToast('Completion document uploaded.', 'success'); onChanged(); }}
        />
      )}
      {review && <ReviewDialog projectId={project.id} decision={review} onClose={() => setReview(null)} onDone={() => { setReview(null); onChanged(); }} showToast={showToast} />}
    </div>
  );
};

const StatusHero = ({ project, access, onReview }) => {
  const s = project.status;
  if (s === 'Completed') {
    return (
      <div className="px-5 sm:px-6 py-5 bg-gradient-to-r from-[#ECFDF3] to-white border-b border-[#ABEFC6] flex items-center gap-3">
        <span className="w-10 h-10 rounded-2xl bg-[#12B76A] text-white flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></span>
        <div><p className="text-sm font-extrabold text-[#05603A]">Project completed</p><p className="text-xs text-[#027A48]">Approved and closed.</p></div>
      </div>
    );
  }
  if (s === 'Pending Approval') {
    return (
      <div className="px-5 sm:px-6 py-5 bg-gradient-to-r from-[#FFFAEB] to-white border-b border-[#FEDF89] flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-[#F79009] text-white flex items-center justify-center"><ClipboardCheck className="w-5 h-5" /></span>
          <div><p className="text-sm font-extrabold text-[#93370D]">Waiting for approval</p><p className="text-xs text-[#B54708]">Submitted {timeAgo(project.submitted_at)} by {project.submitted_by_name || '—'}</p></div>
        </div>
        {access.canApprove && <button onClick={() => onReview('approve')} className="px-4 py-2 bg-[#12B76A] hover:bg-[#039855] text-white text-xs font-extrabold rounded-xl">Review now</button>}
      </div>
    );
  }
  return (
    <div className="px-5 sm:px-6 py-5 border-b border-[#F2F4F7] flex items-center gap-3">
      <span className="w-10 h-10 rounded-2xl bg-[#EFF5FC] text-[#004898] flex items-center justify-center"><ClipboardCheck className="w-5 h-5" /></span>
      <div><p className="text-sm font-extrabold text-[#172033]">Close out this project</p><p className="text-xs text-[#667085]">Three steps — the project only counts as Completed after a Super Admin approves.</p></div>
    </div>
  );
};

const Step = ({ n, done, active, title, text, last, children }) => (
  <li className="relative flex gap-4 pb-6 last:pb-0">
    {!last && <span className={`absolute left-[15px] top-9 bottom-1 w-0.5 ${done ? 'bg-[#12B76A]' : 'bg-[#E4E7EC]'}`} />}
    <span className={`relative z-[1] w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-black border-2 ${done ? 'bg-[#12B76A] border-[#12B76A] text-white' : active ? 'bg-white border-[#004898] text-[#004898] ring-4 ring-[#004898]/10' : 'bg-white border-[#D0D5DD] text-[#98A2B3]'}`}>
      {done ? <Check className="w-4 h-4" strokeWidth={3} /> : n}
    </span>
    <div className="flex-1 min-w-0 pt-1">
      <h4 className={`text-sm font-extrabold ${done || active ? 'text-[#172033]' : 'text-[#98A2B3]'}`}>{title}</h4>
      <p className="text-xs text-[#667085] mt-0.5 mb-3">{text}</p>
      {children}
    </div>
  </li>
);

const DocChip = ({ projectId, file, showToast }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E7EC]">
      <span className="w-9 h-9 rounded-xl bg-white border border-[#E4E7EC] text-[#004898] flex items-center justify-center shrink-0"><ClipboardCheck className="w-4 h-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-[#172033] truncate">{file.display_name}</p>
        <p className="text-[10px] text-[#98A2B3]">{fmtBytes(file.original_size)} · {file.uploaded_by_name || '—'} · {timeAgo(file.created_at)}</p>
      </div>
      <button
        onClick={async () => { setBusy(true); try { await downloadProjectFile(projectId, file); } catch (err) { showToast(err.message, 'error'); } finally { setBusy(false); } }}
        className="p-2 rounded-lg text-[#667085] hover:text-[#004898] hover:bg-white"
        aria-label="Open"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};
