import { FileText, FileSpreadsheet, FileImage, File as FileIcon, PenTool, ClipboardCheck } from 'lucide-react';

// Shared constants and formatting for the Projects workspace.

export const PROJECT_STATUS = {
  Planning: { label: 'Planning', cls: 'bg-[#F2F4F7] text-[#344054] border-[#E4E7EC]', dot: '#98A2B3' },
  Active: { label: 'Active', cls: 'bg-[#EFF5FC] text-[#004898] border-[#B3D1F2]', dot: '#004898' },
  'Pending Approval': { label: 'Pending approval', cls: 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]', dot: '#F79009' },
  Completed: { label: 'Completed', cls: 'bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]', dot: '#12B76A' }
};

export const WORK_STATUS = {
  Assigned: { label: 'Assigned', bg: '#FFFAEB', fg: '#B54708', border: '#FEC84B' },
  Accepted: { label: 'On it', bg: '#EFF5FC', fg: '#004898', border: '#84ADDF' },
  Completed: { label: 'Done', bg: '#ECFDF3', fg: '#027A48', border: '#6CE9A6' },
  Cancelled: { label: 'Cancelled', bg: '#F2F4F7', fg: '#667085', border: '#D0D5DD' }
};

export const dateKey = (d = new Date()) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const keyToDate = (key) => {
  const [y, m, d] = String(key).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (key, n) => {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

export const fmtDay = (key, opts = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  (key ? keyToDate(key).toLocaleDateString('en-GB', opts) : '—');

export const fmtDateTime = (v) => (v
  ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—');

export function timeAgo(value) {
  if (!value) return '—';
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const daysSince = (value) => (value ? Math.floor((Date.now() - new Date(value).getTime()) / 86400000) : 0);

export const FILE_CATEGORIES = [
  { id: 'design', label: 'Design diagram', short: 'Design', icon: PenTool, hint: 'PDF, DWG or Excel drawings' },
  { id: 'boq', label: 'BOQ', short: 'BOQ', icon: FileSpreadsheet, hint: 'Bill of quantities — Excel or PDF' },
  { id: 'image', label: 'Diagram / site image', short: 'Images', icon: FileImage, hint: 'JPG or PNG — compressed before upload' },
  { id: 'document', label: 'Other document', short: 'Documents', icon: FileText, hint: 'Any other project paperwork' },
  { id: 'completion', label: 'Completion document', short: 'Completion', icon: ClipboardCheck, hint: 'Signed & sealed page — PDF or photo' }
];

export const categoryMeta = (id) => FILE_CATEGORIES.find((c) => c.id === id) || FILE_CATEGORIES[3];

export const ACCEPT_BY_CATEGORY = {
  design: '.pdf,.dwg,.xlsx,.xls,.png,.jpg,.jpeg,.webp',
  boq: '.xlsx,.xls,.csv,.pdf',
  image: '.jpg,.jpeg,.png,.webp',
  document: '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.jpg,.jpeg,.png,.webp,.dwg',
  completion: '.pdf,.jpg,.jpeg,.png,.webp'
};

export const fmtBytes = (n) => {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const fileKindIcon = (mime = '') => {
  if (mime.startsWith('image/') && mime !== 'image/vnd.dwg') return FileImage;
  if (mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv') return FileSpreadsheet;
  if (mime === 'application/pdf' || mime.includes('word') || mime.startsWith('text/')) return FileText;
  return FileIcon;
};

export const isPreviewable = (mime = '') =>
  mime === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
