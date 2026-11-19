// Shared by the admin Broadcasts page and the employee popup.

// Tone sets the colour, the label employees see, and the effect.
// `ack`: Important broadcasts need an "I understand" tick before "Got it".
export const BROADCAST_TONES = {
  info: { label: 'Info', color: '#004898', soft: '#E3EDFA', ink: '#003570' },
  nudge: { label: 'Reminder', color: '#D97706', soft: '#FEF0C7', ink: '#92400E' },
  kudos: { label: 'Well done', color: '#059669', soft: '#D5F5E6', ink: '#065F46' },
  important: { label: 'Important', color: '#DC2626', soft: '#FDE2E2', ink: '#991B1B', ack: true }
};

export const BROADCAST_LIMITS = { headline: 120, highlight: 60, message: 600, step: 60, steps: 3 };

export const EMPLOYEE_TYPE_LABELS = { technician: 'Technician', sales: 'Sales', back_office: 'Back-Office' };

// Fixed starting points. Picking one fills the form; every field can still
// be edited before sending, and the template itself never changes.
export const BROADCAST_TEMPLATES = [
  {
    id: 'location', name: 'No location', tone: 'nudge', emoji: '📍',
    headline: 'Turn on location when you check in', highlight: 'location',
    message: "Some of your recent check-ins had no location, so we couldn't verify them. It only takes two seconds.",
    steps: ['Tap Check In', 'Tap Allow when your phone asks']
  },
  {
    id: 'projects', name: 'Update projects', tone: 'nudge', emoji: '📁',
    headline: 'Your projects need an update today', highlight: 'update today',
    message: "Your projects haven't had an update in a while. Add a short note and a photo of today's work before 6 PM.",
    steps: ['Open My Projects', 'Add a note and a photo']
  },
  {
    id: 'late', name: 'Late check-ins', tone: 'nudge', emoji: '⏰',
    headline: 'Please check in before 9:30 AM', highlight: '9:30 AM',
    message: 'We noticed a few late check-ins recently. Checking in on time keeps your attendance clean.',
    steps: []
  },
  {
    id: 'kudos', name: 'Well done', tone: 'kudos', emoji: '🏆',
    headline: 'Great work this month!', highlight: 'Great work',
    message: 'Thank you for checking in on time and keeping your work updated. Keep it going.',
    steps: []
  },
  {
    id: 'rule', name: 'New rule', tone: 'important', emoji: '⚠️',
    headline: 'New leave rule from 1 December', highlight: '1 December',
    message: 'Apply for leave in the app at least 2 days ahead. Same-day leave needs a call to your manager before 9 AM, or the day is marked absent.',
    steps: []
  },
  {
    id: 'meeting', name: 'Meeting', tone: 'info', emoji: '📢',
    headline: 'Team meeting this Saturday at 10 AM', highlight: 'Saturday at 10 AM',
    message: "Everyone at the main office. We'll go over this month's work. It takes about 45 minutes.",
    steps: []
  }
];

export const EMOJI_CHOICES = ['📢', '📍', '📁', '⏰', '🏆', '🎉', '⚠️', '🚨', '👀', '✅', '📸', '🛠️', '📅', '💡', '🙏', '❤️'];

// Splits the headline around the first case-insensitive match of `highlight`.
export function splitHighlight(headline = '', highlight = '') {
  const needle = (highlight || '').trim();
  const at = needle ? headline.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (at < 0) return { before: headline, match: '', after: '' };
  return { before: headline.slice(0, at), match: headline.slice(at, at + needle.length), after: headline.slice(at + needle.length) };
}

export function greetingFor(name, date = new Date()) {
  const hour = date.getHours();
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = (name || '').trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

export const fmtClock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');

export function fmtTimeLeft(iso, now = Date.now()) {
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60000));
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}
