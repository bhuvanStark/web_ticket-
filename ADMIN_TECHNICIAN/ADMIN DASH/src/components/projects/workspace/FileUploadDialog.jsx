import React, { useState, useRef } from 'react';
import { X, UploadCloud, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { uploadProjectFile } from '../../../services/projectApiService';
import { prepareUpload } from '../../../utils/imageCompress';
import { FILE_CATEGORIES, ACCEPT_BY_CATEGORY, categoryMeta, fmtBytes } from './projectFormat';

const MAX_MB = 15;

// Upload one named file to a project. Images are shrunk in the browser first;
// the server gzips the rest. `lockCategory` fixes the category (the
// Completion tab uses it for the signed completion page).
export const FileUploadDialog = ({ projectId, initialCategory = 'design', lockCategory = false, onClose, onUploaded }) => {
  const [category, setCategory] = useState(initialCategory);
  const [name, setName] = useState('');
  const [prepared, setPrepared] = useState(null);
  const [stage, setStage] = useState('pick'); // pick | preparing | ready | uploading
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const input = useRef(null);

  const choose = async (file) => {
    if (!file) return;
    setError('');
    setStage('preparing');
    try {
      const result = await prepareUpload(file);
      if (result.file.size > MAX_MB * 1024 * 1024) throw new Error(`This file is ${fmtBytes(result.file.size)} — the limit is ${MAX_MB} MB`);
      setPrepared(result);
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120));
      setStage('ready');
    } catch (err) {
      setPrepared(null);
      setError(err.message);
      setStage('pick');
    }
  };

  const submit = async () => {
    if (!prepared || !name.trim()) return;
    setStage('uploading');
    setError('');
    setProgress(0);
    try {
      const saved = await uploadProjectFile(projectId, {
        category, displayName: name.trim(), file: prepared.file, fileName: prepared.fileName, thumbnail: prepared.thumbnail
      }, setProgress);
      onUploaded(saved);
    } catch (err) {
      setError(err.message);
      setStage('ready');
    }
  };

  const busy = stage === 'preparing' || stage === 'uploading';
  const meta = categoryMeta(category);

  return (
    <div className="fixed inset-0 z-[70] bg-[#0B1220]/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#F2F4F7] flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-[#172033]">{lockCategory ? `Upload ${meta.label.toLowerCase()}` : 'Upload a project file'}</h3>
            <p className="text-xs text-[#667085] mt-0.5">Max {MAX_MB} MB. Images are compressed automatically.</p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-2 rounded-full hover:bg-[#F2F4F7] text-[#667085] disabled:opacity-40" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318]">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs font-semibold">{error}</p>
            </div>
          )}

          {!lockCategory && (
            <div>
              <label className="block text-xs font-bold text-[#172033] mb-2">What is it?</label>
              <div className="grid grid-cols-2 gap-2">
                {FILE_CATEGORIES.filter((c) => c.id !== 'completion').map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setCategory(c.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${category === c.id ? 'border-[#004898] bg-[#EFF5FC] ring-2 ring-[#004898]/15' : 'border-[#E4E7EC] hover:border-[#B3D1F2]'}`}
                  >
                    <div className="flex items-center gap-2">
                      <c.icon className={`w-4 h-4 ${category === c.id ? 'text-[#004898]' : 'text-[#98A2B3]'}`} />
                      <span className="text-xs font-bold text-[#172033]">{c.label}</span>
                    </div>
                    <p className="text-[10px] text-[#667085] mt-1 leading-snug">{c.hint}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!busy) choose(e.dataTransfer.files?.[0]); }}
            onClick={() => !busy && input.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${dragOver ? 'border-[#004898] bg-[#EFF5FC]' : 'border-[#D0D5DD] hover:border-[#84ADDF] hover:bg-[#F8FAFC]'}`}
          >
            <input ref={input} type="file" className="hidden" accept={ACCEPT_BY_CATEGORY[category]} onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
            {stage === 'preparing' ? (
              <div className="flex flex-col items-center gap-2 text-[#004898]">
                <Loader2 className="w-7 h-7 animate-spin" />
                <span className="text-xs font-bold">Optimising…</span>
              </div>
            ) : prepared ? (
              <div className="flex flex-col items-center gap-1.5">
                <CheckCircle2 className="w-7 h-7 text-[#12B76A]" />
                <span className="text-sm font-bold text-[#172033] break-all">{prepared.fileName}</span>
                <span className="text-[11px] text-[#667085]">
                  {prepared.file.size < prepared.originalSize
                    ? <>{fmtBytes(prepared.originalSize)} → <strong className="text-[#027A48]">{fmtBytes(prepared.file.size)}</strong> after compression</>
                    : fmtBytes(prepared.file.size)}
                </span>
                <span className="text-[11px] font-bold text-[#004898]">Choose a different file</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-2xl bg-[#EFF5FC] text-[#004898] flex items-center justify-center"><UploadCloud className="w-5 h-5" /></div>
                <span className="text-sm font-bold text-[#172033]">Drop a file here or click to browse</span>
                <span className="text-[11px] text-[#667085]">{meta.hint}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#172033] mb-1">Name shown on the project *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              disabled={busy}
              placeholder={category === 'boq' ? 'e.g. BOQ rev 2 — Board room' : category === 'completion' ? 'e.g. Signed completion — Block A' : 'e.g. AV layout — Ground floor'}
              className="w-full px-3 py-2.5 border border-[#E4E7EC] rounded-xl text-sm outline-none focus:border-[#004898]"
            />
          </div>

          {stage === 'uploading' && (
            <div>
              <div className="flex justify-between text-[11px] font-bold text-[#475467] mb-1">
                <span>Uploading…</span><span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#F2F4F7] overflow-hidden">
                <div className="h-full bg-[#004898] rounded-full transition-all" style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[#F2F4F7] flex justify-end gap-2 bg-[#FCFCFD]">
          <button onClick={onClose} disabled={busy} className="px-4 py-2.5 text-xs font-bold text-[#475467] hover:bg-[#F2F4F7] rounded-xl disabled:opacity-40">Cancel</button>
          <button
            onClick={submit}
            disabled={!prepared || !name.trim() || busy}
            className="px-5 py-2.5 bg-[#004898] hover:bg-[#003673] text-white text-xs font-extrabold rounded-xl shadow-xs disabled:opacity-40 flex items-center gap-2"
          >
            {stage === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            Upload
          </button>
        </div>
      </div>
    </div>
  );
};
