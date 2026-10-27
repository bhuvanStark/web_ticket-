import { useApp } from '../context/AppContext';

// Open-work counts for the logged-in technician — shared by TechJobsPage's
// tab badges and the "My Jobs" nav badge (Sidebar + BottomNav) so all three
// always show the same numbers. "Open" = still needs the technician to act:
// tickets Assigned/Active (Unassigned treated as Assigned, same as the
// Accept Job button), activities Assigned/Accepted (the same scope
// ProjectActivitiesPanel lists).
const OPEN_TICKET_STATUSES = ['Assigned', 'Unassigned', 'Active'];
const OPEN_ACTIVITY_STATUSES = ['Assigned', 'Accepted'];

export const useTechWorkload = () => {
  const { tickets, currentUser, myProjectActivities } = useApp();
  const loggedTechId = (currentUser?.id || '').toLowerCase().trim();

  // Same "mine" rule as TechJobsPage: primary or secondary technician.
  const isMine = (t) =>
    (t.assignedToId || '').toLowerCase().trim() === loggedTechId ||
    (t.secondaryTechnicians || []).some(st => (st.id || '').toLowerCase().trim() === loggedTechId);

  const openTickets = loggedTechId
    ? (tickets || []).filter(t => isMine(t) && OPEN_TICKET_STATUSES.includes(t.status)).length
    : 0;
  const openActivities = (myProjectActivities || []).filter(a => OPEN_ACTIVITY_STATUSES.includes(a.status)).length;

  return { openTickets, openActivities, total: openTickets + openActivities };
};
