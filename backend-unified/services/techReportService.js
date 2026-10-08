// Admin → Reports: technician performance over a date range, from real
// ticket (service_requests) and project work (project_activities) data.
// Read-only and additive — nothing else imports this file, and it changes
// no ticket, project or technician behaviour.
//
// Rules (agreed with the product owner):
//   * A ticket is "completed" when its status is completed / resolved /
//     closed; the day it counts on is actual_completion_date (falls back to
//     updated_at for rows from before that column existed).
//   * 'reassigned' is its own column (handed off) — neither done nor open.
//     'cancelled' is ignored everywhere.
//   * Credit: the primary owner (assigned_technician_id) gets "owned"
//     credit; extra technicians (service_request_technicians) get
//     "assisted" credit. Company-wide totals count each ticket once.
//   * A project activity is completed when status = 'Completed', on the
//     India day of completed_at; it is on time when that day is on or
//     before scheduled_date.
//   * Every "day" is an India calendar day (Asia/Kolkata), the same
//     convention as attendance and sales.
import { query } from '../config/database.js';
import { indiaDateKey, isValidDateKey } from '../utils/indiaTime.js';

export const DONE_STATUSES = ['completed', 'resolved', 'closed'];
export const MAX_RANGE_DAYS = 366;

const IST = `'Asia/Kolkata'`;
const ticketDoneDay = `((COALESCE(sr.actual_completion_date, sr.updated_at)) AT TIME ZONE ${IST})::date`;
const activityDoneDay = `((pa.completed_at) AT TIME ZONE ${IST})::date`;

// Lower-cased so legacy capitalised values ('Completed') still match.
const statusSql = `lower(sr.status)`;
const DONE_SQL = `${statusSql} IN ('completed', 'resolved', 'closed')`;
const OPEN_SQL = `${statusSql} NOT IN ('completed', 'resolved', 'closed', 'reassigned', 'cancelled')`;

const invalid = (message) => Object.assign(new Error(message), { code: 'INVALID_RANGE' });

export function resolveRange(from, to) {
  const today = indiaDateKey();
  const start = from || `${today.slice(0, 8)}01`;
  const end = to || today;
  if (!isValidDateKey(start) || !isValidDateKey(end)) throw invalid('from/to must be YYYY-MM-DD dates');
  if (start > end) throw invalid('from must not be after to');
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  if (days > MAX_RANGE_DAYS) throw invalid(`Date range too large — max ${MAX_RANGE_DAYS} days`);
  return { from: start, to: end, today };
}

const num = (v) => (v == null ? null : Number(v));
const round1 = (v) => (v == null ? null : Math.round(Number(v) * 10) / 10);

// Every ticket ↔ technician link with the technician's role on it.
const TICKET_CREDIT_CTE = `
  credit AS (
    SELECT sr.id AS ticket_id, sr.assigned_technician_id AS technician_id, 'owned' AS role,
           COALESCE(sr.service_type, 'onsite_service') AS mode
      FROM service_requests sr
     WHERE sr.assigned_technician_id IS NOT NULL
    UNION
    SELECT srt.service_request_id, srt.technician_id, 'assisted', srt.service_mode
      FROM service_request_technicians srt
      JOIN service_requests sr ON sr.id = srt.service_request_id
     WHERE srt.technician_id IS DISTINCT FROM sr.assigned_technician_id
  )`;

export async function getOverview({ from, to } = {}) {
  const range = resolveRange(from, to);
  const params = [range.from, range.to, range.today];

  const [perTicket, perActivity, kpiTickets, kpiActivities, ticketTrend, activityTrend, technicians] = await Promise.all([
    // Per technician: ticket counts by role.
    query(`
      WITH ${TICKET_CREDIT_CTE}
      SELECT c.technician_id,
        COUNT(*) FILTER (WHERE c.role = 'owned' AND ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2) AS owned_completed,
        COUNT(*) FILTER (WHERE c.role = 'assisted' AND ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2) AS assisted_completed,
        COUNT(*) FILTER (WHERE c.role = 'owned' AND ${statusSql} = 'reassigned' AND ${ticketDoneDay} BETWEEN $1 AND $2) AS reassigned,
        COUNT(*) FILTER (WHERE ${OPEN_SQL}) AS open_now,
        COUNT(*) FILTER (WHERE ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2 AND c.mode = 'remote_support') AS remote_completed,
        AVG(EXTRACT(EPOCH FROM (COALESCE(sr.actual_completion_date, sr.updated_at) - sr.created_at)) / 3600.0)
          FILTER (WHERE c.role = 'owned' AND ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2
                  AND COALESCE(sr.actual_completion_date, sr.updated_at) >= sr.created_at) AS avg_resolution_hours,
        AVG(sr.rating) FILTER (WHERE c.role = 'owned' AND ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2 AND sr.rating > 0) AS avg_rating,
        COUNT(sr.rating) FILTER (WHERE c.role = 'owned' AND ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2 AND sr.rating > 0) AS rating_count
      FROM credit c
      JOIN service_requests sr ON sr.id = c.ticket_id
      GROUP BY c.technician_id`, params.slice(0, 2)),

    // Per technician: project activities.
    query(`
      SELECT pa.technician_id,
        COUNT(*) FILTER (WHERE pa.status <> 'Cancelled' AND pa.scheduled_date BETWEEN $1 AND $2) AS scheduled,
        COUNT(*) FILTER (WHERE pa.status = 'Completed' AND ${activityDoneDay} BETWEEN $1 AND $2) AS completed,
        COUNT(*) FILTER (WHERE pa.status = 'Completed' AND ${activityDoneDay} BETWEEN $1 AND $2
                         AND (pa.scheduled_date IS NULL OR ${activityDoneDay} <= pa.scheduled_date)) AS on_time,
        COUNT(*) FILTER (WHERE pa.status IN ('Assigned', 'Accepted') AND pa.scheduled_date < $3) AS overdue_now
      FROM project_activities pa
      WHERE pa.technician_id IS NOT NULL
      GROUP BY pa.technician_id`, params),

    // Company-wide ticket KPIs — each ticket once.
    query(`
      SELECT
        COUNT(*) FILTER (WHERE ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2) AS completed,
        COUNT(*) FILTER (WHERE ${OPEN_SQL}) AS open_now,
        COUNT(*) FILTER (WHERE ${OPEN_SQL} AND sr.assigned_technician_id IS NULL) AS unassigned_now,
        AVG(EXTRACT(EPOCH FROM (COALESCE(sr.actual_completion_date, sr.updated_at) - sr.created_at)) / 3600.0)
          FILTER (WHERE ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2
                  AND COALESCE(sr.actual_completion_date, sr.updated_at) >= sr.created_at) AS avg_resolution_hours,
        AVG(sr.rating) FILTER (WHERE ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2 AND sr.rating > 0) AS avg_rating,
        COUNT(sr.rating) FILTER (WHERE ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2 AND sr.rating > 0) AS rating_count
      FROM service_requests sr`, params.slice(0, 2)),

    query(`
      SELECT
        COUNT(*) FILTER (WHERE pa.status = 'Completed' AND ${activityDoneDay} BETWEEN $1 AND $2) AS completed,
        COUNT(*) FILTER (WHERE pa.status = 'Completed' AND ${activityDoneDay} BETWEEN $1 AND $2
                         AND (pa.scheduled_date IS NULL OR ${activityDoneDay} <= pa.scheduled_date)) AS on_time,
        COUNT(*) FILTER (WHERE pa.status IN ('Assigned', 'Accepted') AND pa.scheduled_date < $3) AS overdue_now
      FROM project_activities pa`, params),

    // Daily completions (India days) for the trend chart.
    query(`
      SELECT to_char(${ticketDoneDay}, 'YYYY-MM-DD') AS day, COUNT(*) AS n
        FROM service_requests sr
       WHERE ${DONE_SQL} AND ${ticketDoneDay} BETWEEN $1 AND $2
       GROUP BY 1`, params.slice(0, 2)),
    query(`
      SELECT to_char(${activityDoneDay}, 'YYYY-MM-DD') AS day, COUNT(*) AS n
        FROM project_activities pa
       WHERE pa.status = 'Completed' AND ${activityDoneDay} BETWEEN $1 AND $2
       GROUP BY 1`, params.slice(0, 2)),

    query(`SELECT id, full_name, location, specialization, is_active FROM technicians ORDER BY full_name`)
  ]);

  const ticketsBy = new Map(perTicket.rows.map((r) => [r.technician_id, r]));
  const activitiesBy = new Map(perActivity.rows.map((r) => [r.technician_id, r]));

  const rows = technicians.rows.map((t) => {
    const tk = ticketsBy.get(t.id) || {};
    const pa = activitiesBy.get(t.id) || {};
    const activitiesCompleted = num(pa.completed) || 0;
    return {
      technicianId: t.id,
      name: t.full_name,
      location: t.location || null,
      specialization: t.specialization || null,
      isActive: t.is_active !== false,
      tickets: {
        owned: num(tk.owned_completed) || 0,
        assisted: num(tk.assisted_completed) || 0,
        reassigned: num(tk.reassigned) || 0,
        openNow: num(tk.open_now) || 0,
        remote: num(tk.remote_completed) || 0,
        avgResolutionHours: round1(tk.avg_resolution_hours),
        avgRating: round1(tk.avg_rating),
        ratingCount: num(tk.rating_count) || 0
      },
      projects: {
        scheduled: num(pa.scheduled) || 0,
        completed: activitiesCompleted,
        onTime: num(pa.on_time) || 0,
        onTimeRate: activitiesCompleted ? Math.round(((num(pa.on_time) || 0) / activitiesCompleted) * 1000) / 10 : null,
        overdueNow: num(pa.overdue_now) || 0
      }
    };
  })
    // Inactive technicians only appear when they did something in range.
    .filter((r) => r.isActive || r.tickets.owned || r.tickets.assisted || r.tickets.reassigned || r.tickets.openNow
      || r.projects.scheduled || r.projects.completed);

  const kt = kpiTickets.rows[0] || {};
  const ka = kpiActivities.rows[0] || {};
  const activitiesDone = num(ka.completed) || 0;

  const trendTickets = new Map(ticketTrend.rows.map((r) => [r.day, num(r.n)]));
  const trendActivities = new Map(activityTrend.rows.map((r) => [r.day, num(r.n)]));
  const trend = [];
  for (let d = new Date(`${range.from}T00:00:00Z`); d.toISOString().slice(0, 10) <= range.to; d = new Date(d.getTime() + 86400000)) {
    const key = d.toISOString().slice(0, 10);
    trend.push({ day: key, tickets: trendTickets.get(key) || 0, activities: trendActivities.get(key) || 0 });
  }

  return {
    range: { from: range.from, to: range.to },
    kpis: {
      ticketsCompleted: num(kt.completed) || 0,
      openNow: num(kt.open_now) || 0,
      unassignedNow: num(kt.unassigned_now) || 0,
      avgResolutionHours: round1(kt.avg_resolution_hours),
      avgRating: round1(kt.avg_rating),
      ratingCount: num(kt.rating_count) || 0,
      activitiesCompleted: activitiesDone,
      activitiesOnTimeRate: activitiesDone ? Math.round(((num(ka.on_time) || 0) / activitiesDone) * 1000) / 10 : null,
      activitiesOverdueNow: num(ka.overdue_now) || 0
    },
    technicians: rows,
    trend
  };
}

// One technician's work in the range: tickets completed / handed off in the
// range plus everything still open, and project activities scheduled or
// completed in the range plus any still overdue.
export async function getTechnicianDetail(technicianId, { from, to } = {}) {
  const range = resolveRange(from, to);
  const [tech, tickets, activities] = await Promise.all([
    query(`SELECT id, full_name, location, specialization, is_active FROM technicians WHERE id = $1`, [technicianId]),
    query(`
      WITH ${TICKET_CREDIT_CTE}
      SELECT sr.id, sr.ticket_number, sr.issue_title, sr.issue_category, sr.status, sr.priority,
             COALESCE(NULLIF(sr.customer_org, ''), cu.company_name, cu.name) AS customer,
             sr.created_at, COALESCE(sr.actual_completion_date, CASE WHEN ${DONE_SQL} OR ${statusSql} = 'reassigned' THEN sr.updated_at END) AS completed_at,
             sr.rating, c.role, c.mode,
             CASE WHEN ${DONE_SQL} THEN 'completed' WHEN ${statusSql} = 'reassigned' THEN 'reassigned' ELSE 'open' END AS bucket
        FROM credit c
        JOIN service_requests sr ON sr.id = c.ticket_id
        LEFT JOIN customers cu ON cu.id = sr.customer_id
       WHERE c.technician_id = $1
         AND (${OPEN_SQL}
              OR ((${DONE_SQL} OR ${statusSql} = 'reassigned') AND ${ticketDoneDay} BETWEEN $2 AND $3))
       ORDER BY COALESCE(sr.actual_completion_date, sr.updated_at) DESC NULLS LAST
       LIMIT 500`, [technicianId, range.from, range.to]),
    query(`
      SELECT pa.id, pa.status, to_char(pa.scheduled_date, 'YYYY-MM-DD') AS scheduled_date, pa.scheduled_time,
             pa.completed_at, pa.completion_notes, p.name AS project_name, p.customer AS project_customer,
             CASE WHEN pa.status = 'Completed'
                  THEN (pa.scheduled_date IS NULL OR ${activityDoneDay} <= pa.scheduled_date) END AS on_time
        FROM project_activities pa
        LEFT JOIN projects p ON p.id = pa.project_id
       WHERE pa.technician_id = $1
         AND pa.status <> 'Cancelled'
         AND (pa.scheduled_date BETWEEN $2 AND $3
              OR (pa.status = 'Completed' AND ${activityDoneDay} BETWEEN $2 AND $3)
              OR (pa.status IN ('Assigned', 'Accepted') AND pa.scheduled_date < $4))
       ORDER BY pa.scheduled_date DESC NULLS LAST
       LIMIT 500`, [technicianId, range.from, range.to, range.today])
  ]);

  if (!tech.rows.length) return null;
  const t = tech.rows[0];
  return {
    range: { from: range.from, to: range.to },
    technician: { id: t.id, name: t.full_name, location: t.location || null, specialization: t.specialization || null, isActive: t.is_active !== false },
    tickets: tickets.rows.map((r) => ({
      id: r.id,
      ticketNumber: r.ticket_number,
      title: r.issue_title,
      category: r.issue_category,
      status: r.status,
      priority: r.priority,
      customer: r.customer,
      createdAt: r.created_at,
      completedAt: r.bucket === 'open' ? null : r.completed_at,
      rating: r.rating,
      role: r.role,
      mode: r.mode,
      bucket: r.bucket
    })),
    activities: activities.rows.map((r) => ({
      id: r.id,
      status: r.status,
      scheduledDate: r.scheduled_date,
      scheduledTime: r.scheduled_time,
      completedAt: r.completed_at,
      notes: r.completion_notes,
      projectName: r.project_name,
      projectCustomer: r.project_customer,
      onTime: r.on_time,
      overdue: ['Assigned', 'Accepted'].includes(r.status) && r.scheduled_date != null && r.scheduled_date < range.today
    }))
  };
}
