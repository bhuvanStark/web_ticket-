import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UploadCloud, Download, Eye, Trash2, X, Loader2, FolderOpen, HardDrive, Lock } from 'lucide-react';
import { fetchProjectFileBlob, deleteProjectFile } from '../../../services/projectApiService';
import { FileUploadDialog } from './FileUploadDialog';
import { downloadProjectFile } from './projectFiles';
import { Empty } from './projectUi';
import { FILE_CATEGORIES, categoryMeta, fmtBytes, fileKindIcon, isPreviewable, timeAgo } from './projectFormat';

// Thumbnails are tiny (≤60 KB) and immutable: keep their object URLs for the
// whole session so switching tabs never re-downloads them.
const thumbCache = new Map();

export const FilesTab = ({ data, onChanged, showToast }) => {
  const { project, files, access, storage } = data;
  const [filter, setFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const counts = useMemo(() => files.reduce((m, f) => ({ ...m, [f.category]: (m[f.category] || 0) + 1 }), {}), [files]);
  const shown = filter === 'all' ? files : files.filter((f) => f.category === filter);
  const locked = project.status === 'Completed';
  const canUpload = access.canManage && !locked;
  const used = storage.usedBytes / storage.limitBytes;
  const saved = files.reduce((n, f) => n + Math.max(0, f.original_size - f.stored_size), 0);

  const isLockedDoc = (f) => f.id === project.completion_file_id && ['Pending Approval', 'Completed'].includes(project.status);

  const remove = async (f) => {
    if (!window.confirm(`Delete "${f.display_name}"? This cannot be undone.`)) return;
    setBusyId(f.id);
    try {
      await deleteProjectFile(project.id, f.id);
      showToast('File deleted.', 'info');
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const download = async (f) => {
    setBusyId(f.id);
    try {
      await downloadProjectFile(project.id, f);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-[#E4E7EC] p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-[#EFF5FC] text-[#004898] flex items-center justify-center"><HardDrive className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-extrabold text-[#172033]">{fmtBytes(storage.usedBytes)}</span>
              <span className="text-xs text-[#667085]">of {fmtBytes(storage.limitBytes)} · {storage.fileCount}/{storage.maxFiles} files</span>
              {saved > 0 && <span className="text-[11px] font-bold text-[#027A48]">{fmtBytes(saved)} saved by compression</span>}
            </div>
            <div className="mt-2 h-1.5 w-full md:w-72 rounded-full bg-[#F2F4F7] overflow-hidden">
              <div className={`h-full rounded-full ${used > 0.85 ? 'bg-[#F04438]' : 'bg-[#004898]'}`} style={{ width: `${Math.min(100, Math.max(used * 100, storage.usedBytes ? 2 : 0))}%` }} />
            </div>
          </div>
        </div>
        {canUpload && (
          <button onClick={() => setUploading(true)} className="px-4 py-2.5 bg-[#004898] hover:bg-[#003673] text-white text-xs font-extrabold rounded-xl shadow-xs flex items-center gap-2 self-start md:self-auto">
            <UploadCloud className="w-4 h-4" /> Upload file
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[{ id: 'all', short: 'All files' }, ...FILE_CATEGORIES].map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filter === c.id ? 'bg-[#172033] text-white border-[#172033]' : 'bg-white text-[#475467] border-[#E4E7EC] hover:border-[#98A2B3]'}`}
          >
            {c.short}
            <span className={`ml-1.5 ${filter === c.id ? 'text-white/70' : 'text-[#98A2B3]'}`}>{c.id === 'all' ? files.length : counts[c.id] || 0}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E4E7EC]">
          <Empty icon={FolderOpen} title="No files here yet" text="Design diagrams, BOQs, site images and the signed completion page all live here, named so everyone knows what they are.">
            {canUpload && (
              <button onClick={() => setUploading(true)} className="px-4 py-2 bg-white border border-[#E4E7EC] hover:bg-[#F8FAFC] text-[#004898] text-xs font-bold rounded-xl inline-flex items-center gap-2">
                <UploadCloud className="w-4 h-4" /> Upload the first file
              </button>
            )}
          </Empty>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map((f) => {
            const meta = categoryMeta(f.category);
            const KindIcon = fileKindIcon(f.mime_type);
            return (
              <article key={f.id} className="group bg-white rounded-2xl border border-[#E4E7EC] overflow-hidden hover:shadow-md hover:border-[#B3D1F2] transition-all flex flex-col">
                <button
                  onClick={() => (isPreviewable(f.mime_type) ? setPreview(f) : download(f))}
                  className="relative h-36 bg-[#F8FAFC] flex items-center justify-center overflow-hidden border-b border-[#F2F4F7]"
                  title={isPreviewable(f.mime_type) ? 'Preview' : 'Download'}
                >
                  {f.has_thumbnail ? (
                    <Thumb projectId={project.id} fileId={f.id} alt={f.display_name} />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-[#98A2B3]">
                      <KindIcon className="w-10 h-10" strokeWidth={1.4} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{(f.file_name.split('.').pop() || '').slice(0, 5)}</span>
                    </div>
                  )}
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/95 border border-[#E4E7EC] text-[10px] font-bold text-[#344054] shadow-xs">
                    <meta.icon className="w-3 h-3 text-[#004898]" /> {meta.short}
                  </span>
                  {isLockedDoc(f) && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#172033] text-white text-[10px] font-bold">
                      <Lock className="w-3 h-3" /> Approval record
                    </span>
                  )}
                </button>
                <div className="p-3.5 flex-1 flex flex-col">
                  <h4 className="text-sm font-bold text-[#172033] leading-snug line-clamp-2 break-words">{f.display_name}</h4>
                  <p className="text-[11px] text-[#667085] mt-1 truncate" title={f.file_name}>{f.file_name}</p>
                  <div className="mt-auto pt-3 flex items-end justify-between gap-2">
                    <div className="text-[10px] text-[#98A2B3] leading-relaxed">
                      <div>{fmtBytes(f.original_size)}{f.stored_size < f.original_size * 0.95 && <span className="text-[#027A48] font-bold"> · stored {fmtBytes(f.stored_size)}</span>}</div>
                      <div>{f.uploaded_by_name || 'Someone'} · {timeAgo(f.created_at)}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {busyId === f.id ? <Loader2 className="w-4 h-4 animate-spin text-[#004898] m-1.5" /> : (
                        <>
                          {isPreviewable(f.mime_type) && (
                            <IconBtn onClick={() => setPreview(f)} label="Preview"><Eye className="w-4 h-4" /></IconBtn>
                          )}
                          <IconBtn onClick={() => download(f)} label="Download"><Download className="w-4 h-4" /></IconBtn>
                          {access.canManage && !isLockedDoc(f) && !locked && (
                            <IconBtn onClick={() => remove(f)} label="Delete" danger><Trash2 className="w-4 h-4" /></IconBtn>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {uploading && (
        <FileUploadDialog
          projectId={project.id}
          initialCategory={filter !== 'all' && filter !== 'completion' ? filter : 'design'}
          onClose={() => setUploading(false)}
          onUploaded={() => { setUploading(false); showToast('File uploaded.', 'success'); onChanged(); }}
        />
      )}
      {preview && <FilePreview projectId={project.id} file={preview} onClose={() => setPreview(null)} onDownload={() => download(preview)} />}
    </div>
  );
};

const IconBtn = ({ children, onClick, label, danger }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`p-1.5 rounded-lg transition-colors ${danger ? 'text-[#98A2B3] hover:text-[#D92D20] hover:bg-[#FEF3F2]' : 'text-[#667085] hover:text-[#004898] hover:bg-[#EFF5FC]'}`}
  >
    {children}
  </button>
);

// Loads a thumbnail only once its card scrolls into view.
const Thumb = ({ projectId, fileId, alt }) => {
  const ref = useRef(null);
  const [url, setUrl] = useState(thumbCache.get(fileId) || null);
  useEffect(() => {
    if (url || !ref.current) return undefined;
    let cancelled = false;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const blob = await fetchProjectFileBlob(projectId, fileId, { thumbnail: true });
        const objectUrl = URL.createObjectURL(blob);
        thumbCache.set(fileId, objectUrl);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        // leave the placeholder
      }
    }, { rootMargin: '200px' });
    observer.observe(ref.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [projectId, fileId, url]);
  return url
    ? <img src={url} alt={alt} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
    : <div ref={ref} className="w-full h-full animate-pulse bg-[#F2F4F7]" />;
};

const FilePreview = ({ projectId, file, onClose, onDownload }) => {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    fetchProjectFileBlob(projectId, file.id)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [projectId, file.id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] bg-[#0B1220]/85 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">{file.display_name}</div>
          <div className="text-[11px] text-white/60 truncate">{file.file_name} · {fmtBytes(file.original_size)}</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onDownload} className="p-2 rounded-lg hover:bg-white/10" aria-label="Download"><Download className="w-5 h-5" /></button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 sm:p-6" onClick={(e) => e.stopPropagation()}>
        {error ? <p className="text-sm text-white/80">{error}</p>
          : !url ? <Loader2 className="w-8 h-8 text-white animate-spin" />
          : file.mime_type === 'application/pdf'
            ? <iframe title={file.display_name} src={url} className="w-full h-full max-w-5xl bg-white rounded-xl" />
            : <img src={url} alt={file.display_name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />}
      </div>
    </div>
  );
};
