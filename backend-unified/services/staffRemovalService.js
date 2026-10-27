import { query, withTransaction } from '../config/database.js';
import { reassignLeadsForDeactivatedSales, archiveClosedLeadsForRemovedSales } from './leadService.js';

// Staff removal (PLAN_Staff_Removal.md, migration 040).
//
// Remove = the employee is fired. Their row is kept so their name stays on
// past work, but they are locked out for good (is_active = false plus a
// token_version bump, checked live by middleware/auth.js checkStaffSession).
// Their attendance is deleted; all work data is kept:
//   * technician — tickets that are not done go back to 'unassigned'; done
//     tickets, reports and signatures are untouched.
//   * sales — Won/Lost/Dead leads are archived with the owner kept; every
//     other lead goes back to the unassigned pool for Admin to reassign.
//   * back_office — owns no work records.
// Delete (the row itself) is only allowed when there is no work history.

export const STAFF_ROLES = {
  technician: { table: 'technicians', ownerColumn: 'technician_id', label: 'Technician' },
  sales: { table: 'sales', ownerColumn: 'sales_id', label: 'Sales employee' },
  back_office: { table: 'back_office', ownerColumn: 'back_office_id', label: 'Back-Office employee' }
};

// A ticket in one of these is finished work and keeps its technician.
// Everything else (unassigned, assigned, active, pending, reassigned and the
// open legacy values) goes back to 'unassigned'.
export const DONE_TICKET_STATUSES = [
  'completed', 'resolved', 'closed', 'cancelled', 'service_completed', 'pending_customer_signoff'
];

const fail = (status, message) => Object.assign(new Error(message), { status });

function roleConfig(role) {
  const config = STAFF_ROLES[role];
  if (!config) throw fail(400, `Unknown staff role: ${role}`);
  return config;
}

// Counts of everything the person is linked to. `run` is a query function
// so this works inside a transaction or on its own.
async function workSummary(role, id, run) {
  const { ownerColumn } = roleConfig(role);
  const count = async (sql, values) => (await run(sql, values)).rows[0].count;
  const summary = {
    attendanceRecords: await count(`SELECT COUNT(*)::int AS count FROM attendance_records WHERE ${ownerColumn} = $1`, [id])
  };

  if (role === 'technician') {
    summary.openTickets = await count(
      'SELECT COUNT(*)::int AS count FROM service_requests WHERE assigned_technician_id = $1 AND status <> ALL($2::text[])',
      [id, DONE_TICKET_STATUSES]
    );
    summary.completedTickets = await count(
      'SELECT COUNT(*)::int AS count FROM service_requests WHERE assigned_technician_id = $1 AND status = ANY($2::text[])',
      [id, DONE_TICKET_STATUSES]
    );
    summary.coTechnicianTickets = await count(
      'SELECT COUNT(*)::int AS count FROM service_request_technicians WHERE technician_id = $1', [id]
    );
    summary.projectActivities = await count(
      'SELECT COUNT(*)::int AS count FROM project_activities WHERE technician_id = $1', [id]
    );
    summary.hasWorkHistory = summary.openTickets + summary.completedTickets
      + summary.coTechnicianTickets + summary.projectActivities > 0;
  } else if (role === 'sales') {
    summary.closedLeads = await count(
      `SELECT COUNT(*)::int AS count FROM leads
        WHERE assigned_to = $1 AND status IN ('won', 'lost', 'dead') AND archived_at IS NULL`, [id]
    );
    summary.openLeads = await count(
      `SELECT COUNT(*)::int AS count FROM leads
        WHERE assigned_to = $1 AND status NOT IN ('won', 'lost', 'dead') AND archived_at IS NULL`, [id]
    );
    const anyLead = await count(
      'SELECT COUNT(*)::int AS count FROM leads WHERE assigned_to = $1 OR won_requested_by = $1', [id]
    );
    const leadActions = await count('SELECT COUNT(*)::int AS count FROM lead_history WHERE actor_id = $1', [id]);
    summary.dailyReports = await count(
      'SELECT COUNT(*)::int AS count FROM sales_daily_reports WHERE sales_id = $1', [id]
    );
    summary.hasWorkHistory = anyLead + leadActions + summary.dailyReports > 0;
  } else {
    summary.hasWorkHistory = false;
  }
  return summary;
}

// What Remove / Delete would do, for the confirmation dialog.
export async function removalPreview(role, id) {
  const { table, label } = roleConfig(role);
  const { rows } = await query(`SELECT id, full_name, removed_at FROM ${table} WHERE id = $1`, [id]);
  if (!rows[0]) throw fail(404, `${label} not found`);
  const summary = await workSummary(role, id, query);
  return {
    id,
    name: rows[0].full_name,
    removed: Boolean(rows[0].removed_at),
    ...summary,
    canDelete: !summary.hasWorkHistory
  };
}

// actor: { type: 'admin', id, name }
export async function removeStaff(role, id, actor) {
  const { table, ownerColumn, label } = roleConfig(role);

  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT id, full_name, removed_at FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
    const person = rows[0];
    if (!person) throw fail(404, `${label} not found`);
    if (person.removed_at) throw fail(409, `${person.full_name || label} has already been removed`);

    // 1. Lock out: every existing token is rejected on its next use.
    await client.query(
      `UPDATE ${table}
          SET is_active = false, token_version = token_version + 1,
              removed_at = now(), removed_by = $2, updated_at = now()
        WHERE id = $1`,
      [id, actor?.id || null]
    );

    // 2. Attendance goes; pending sign-in codes / reset links die.
    const attendance = await client.query(`DELETE FROM attendance_records WHERE ${ownerColumn} = $1`, [id]);
    await client.query(
      `UPDATE password_resets SET status = 'rejected', updated_at = now()
        WHERE ${ownerColumn} = $1 AND status IN ('pending', 'approved')`,
      [id]
    );

    const result = { id, name: person.full_name, attendanceDeleted: attendance.rowCount };

    // 3. Hand over open work; finished work stays as it is.
    if (role === 'technician') {
      const unassigned = await client.query(
        `UPDATE service_requests
            SET assigned_technician_id = NULL, status = 'unassigned', updated_at = now()
          WHERE assigned_technician_id = $1 AND status <> ALL($2::text[])
          RETURNING id`,
        [id, DONE_TICKET_STATUSES]
      );
      const coTech = await client.query(
        `DELETE FROM service_request_technicians srt
          USING service_requests sr
          WHERE srt.service_request_id = sr.id AND srt.technician_id = $1
            AND sr.status <> ALL($2::text[])`,
        [id, DONE_TICKET_STATUSES]
      );
      await client.query('DELETE FROM technician_push_subscriptions WHERE technician_id = $1', [id]);
      result.ticketsUnassigned = unassigned.rowCount;
      result.coTechnicianRowsRemoved = coTech.rowCount;
    } else if (role === 'sales') {
      const archived = await archiveClosedLeadsForRemovedSales(id, actor, client);
      const reopened = await reassignLeadsForDeactivatedSales(id, actor, client);
      result.leadsArchived = archived.length;
      result.leadsReopened = reopened.length;
    }

    return result;
  });
}

// Permanent delete — only for someone with no work history (e.g. created
// by mistake). Their attendance goes with them.
export async function deleteStaff(role, id) {
  const { table, ownerColumn, label } = roleConfig(role);

  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT id, full_name FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
    const person = rows[0];
    if (!person) throw fail(404, `${label} not found`);

    const run = client.query.bind(client);
    const summary = await workSummary(role, id, run);
    if (summary.hasWorkHistory) {
      throw fail(409, `${person.full_name || label} has work history and can't be deleted. Use Remove instead — it keeps their work and locks them out.`);
    }

    await client.query(`DELETE FROM attendance_records WHERE ${ownerColumn} = $1`, [id]);
    await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return { id, name: person.full_name };
  });
}
