import express from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabaseClient.js';
import { query, withTransaction } from '../config/database.js';
import { requireAdmin, requireAuth, requireSuperAdmin, requirePermission, hashPassword } from '../middleware/auth.js';
import { validateUUID, validateStatusUpdate, validateAssignTechnician, validatePagination } from '../middleware/validation.js';
// Project Category (V1) — additive; only used by the technician
// impersonation route below.
import * as projectActivityService from '../services/projectActivityService.js';

const router = express.Router();

// ============================================
// CSV HELPERS
// ============================================

// Quote a value for CSV: wrap in quotes and double any embedded quotes. Also
// guards against spreadsheet formula injection from leading =, +, -, @.
const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const toCsv = (columns, rows) => {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(','));
  return [header, ...body].join('\r\n');
};

const sendCsv = (res, filename, csv) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel opens UTF-8 correctly.
  res.send('﻿' + csv);
};

// ============================================
// COMPANIES (derived from existing customer records — no separate table)
// ============================================

router.get('/companies', requireAdmin, requirePermission('customers'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('company_name, created_at')
      .not('company_name', 'is', null)
      .order('company_name', { ascending: true });

    if (error) throw error;

    // Collapse to distinct companies, keeping the earliest record's date and
    // counting how many customer accounts belong to each.
    const byName = new Map();
    for (const row of data || []) {
      const name = (row.company_name || '').trim();
      if (!name) continue;

      const key = name.toLowerCase();
      const existing = byName.get(key);

      if (existing) {
        existing.account_count += 1;
        if (row.created_at && row.created_at < existing.created_at) {
          existing.created_at = row.created_at;
        }
      } else {
        byName.set(key, {
          id: key,
          company_name: name,
          // Derived code: first three alphanumeric characters, uppercased.
          company_code: name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase(),
          created_at: row.created_at,
          account_count: 1
        });
      }
    }

    const companies = [...byName.values()].sort((a, b) =>
      a.company_name.localeCompare(b.company_name)
    );

    res.json({ success: true, data: companies, count: companies.length });
  } catch (error) {
    console.error('Error listing companies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CSV EXPORT
// ============================================

router.get('/export/customers', requireAdmin, requirePermission('customers'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('name, email, phone, company_name, address, city, created_at')
      .order('company_name', { ascending: true });

    if (error) throw error;

    const csv = toCsv(
      [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'company_name', label: 'Company' },
        { key: 'address', label: 'Address' },
        { key: 'city', label: 'City' },
        { key: 'created_at', label: 'Created At' }
      ],
      data || []
    );

    sendCsv(res, `customers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (error) {
    console.error('Error exporting customers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/technicians', requireAdmin, requirePermission('technicians'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('technicians')
      .select('full_name, email, phone, specialization, is_active, created_at')
      .order('full_name', { ascending: true });

    if (error) throw error;

    const csv = toCsv(
      [
        { key: 'full_name', label: 'Full Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'specialization', label: 'Specialization' },
        { key: 'is_active', label: 'Active' },
        { key: 'created_at', label: 'Created At' }
      ],
      data || []
    );

    sendCsv(res, `technicians-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (error) {
    console.error('Error exporting technicians:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DASHBOARD ENDPOINTS
// ============================================

// Get Dashboard Overview
router.get('/dashboard/overview', requireAdmin, async (req, res) => {
  try {
    const { data: requestsData } = await supabase
      .from('service_requests')
      .select('id, status, priority, created_at');

    const { data: techniciansData } = await supabase
      .from('technicians')
      .select('id, status');

    const { data: customersData } = await supabase
      .from('customers')
      .select('id', { count: 'exact' });

    const stats = {
      total_requests: requestsData?.length || 0,
      total_technicians: techniciansData?.length || 0,
      total_customers: customersData?.length || 0,
      requests_by_status: {},
      requests_by_priority: {},
      technicians_available: techniciansData?.filter(t => t.status === 'available').length || 0,
      technicians_busy: techniciansData?.filter(t => t.status === 'busy').length || 0
    };

    requestsData?.forEach(req => {
      stats.requests_by_status[req.status] = (stats.requests_by_status[req.status] || 0) + 1;
      stats.requests_by_priority[req.priority] = (stats.requests_by_priority[req.priority] || 0) + 1;
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// ============================================
// SERVICE REQUEST MANAGEMENT
// ============================================

// Get All Service Requests (Admin)
router.get('/service-requests', requireAdmin, requirePermission('requests'), validatePagination, async (req, res) => {
  try {
    const { limit = 10, offset = 0, status, priority } = req.query;

    let query = supabase
      .from('service_requests')
      .select(`
        *,
        customers (id, name, company_name, email, phone),
        locations (id, name, city, address),
        rooms (id, name, room_type),
        technician:assigned_technician_id (id, full_name, email, phone, specialization, is_active)
      `)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: count > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// Get Single Service Request
router.get('/service-requests/:id', requireAdmin, requirePermission('requests'), validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        *,
        customers (id, name, company_name, email, phone),
        locations (id, name, city, address),
        rooms (id, name, room_type, capacity),
        technician:assigned_technician_id (id, full_name, email, phone, specialization, is_active),
        service_updates (id, author_name, notes, created_at)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Service request not found'
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// Assign Technician to Request
router.post('/service-requests/:id/assign', requireAdmin, requirePermission('requests'), validateUUID, validateAssignTechnician, async (req, res) => {
  try {
    const { id } = req.params;
    const { technician_id, notes } = req.body;

    // Verify request exists
    const { data: request } = await supabase
      .from('service_requests')
      .select('id, is_active')
      .eq('id', id)
      .single();

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Service request not found'
      });
    }

    // Verify technician exists
    const { data: technician } = await supabase
      .from('technicians')
      .select('id, full_name, is_active')
      .eq('id', technician_id)
      .single();

    if (!technician || !technician.is_active) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Technician not found'
      });
    }

    // Update request with technician
    const { data: updated, error } = await supabase
      .from('service_requests')
      .update({
        assigned_technician_id: technician_id,
        status: 'assigned',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Add service update
    await supabase.from('service_updates').insert([
      {
        service_request_id: id,
        author_name: 'Admin',
        notes: `Assigned to ${technician.full_name}. ${notes || ''}`
      }
    ]);

    res.json({
      success: true,
      message: 'Technician assigned successfully',
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// Update Request Status
router.patch('/service-requests/:id/status', requireAdmin, requirePermission('requests'), validateUUID, validateStatusUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Service request not found'
      });
    }

    // Add service update
    if (notes) {
      await supabase.from('service_updates').insert([
        {
          service_request_id: id,
          author_name: 'Admin',
          notes: `Status changed to ${status}. ${notes}`
        }
      ]);
    }

    res.json({
      success: true,
      message: 'Status updated successfully',
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// ============================================
// TECHNICIAN MANAGEMENT
// ============================================

// Get All Technicians
router.get('/technicians', requireAdmin, requirePermission('technicians'), validatePagination, async (req, res) => {
  try {
    const { limit = 10, offset = 0, status } = req.query;

    let query = supabase
      .from('technicians')
      .select(`
        *,
        service_requests:assigned_technician_id (count)
      `)
      .order('full_name', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status === 'active') query = query.eq('is_active', true);
    if (status === 'inactive') query = query.eq('is_active', false);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// Get Technician Details
router.get('/technicians/:id', requireAdmin, requirePermission('technicians'), validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('technicians')
      .select(`
        *,
        service_requests:assigned_technician_id (id, status, issue_title, created_at)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Technician not found'
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// Project Category (V1) — a specific technician's own Daily Project
// Activities, read through an admin token. Additive: exists solely for the
// "switch into a technician's view" impersonation feature (Sidebar picker),
// which never holds a technician-role JWT — the same reason fetchLiveTickets
// always uses the admin-scoped ticket endpoint instead of a technician-only
// one while impersonating. A real technician session keeps using
// GET /api/technician/project-activities.
router.get('/technicians/:id/project-activities', requireAdmin, validateUUID, async (req, res) => {
  try {
    const data = await projectActivityService.listActivitiesForTechnician(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// Update Technician Status
router.patch('/technicians/:id/status', requireAdmin, requirePermission('technicians'), validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['available', 'busy', 'on-leave', 'offline'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    const { data, error } = await supabase
      .from('technicians')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Technician not found'
      });
    }

    res.json({
      success: true,
      message: 'Technician status updated',
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// ============================================
// REPORTS & ANALYTICS
// ============================================

// Get Service Analytics
router.get('/analytics/service-requests', requireAdmin, requirePermission('reports'), async (req, res) => {
  try {
    const { data: requests } = await supabase
      .from('service_requests')
      .select('id, status, priority, created_at, updated_at, rating');

    const analytics = {
      total: requests?.length || 0,
      by_status: {},
      by_priority: {},
      average_rating: 0,
      total_reviews: 0,
      completion_rate: 0
    };

    let totalRating = 0;
    let ratedCount = 0;
    let completed = 0;

    requests?.forEach(req => {
      analytics.by_status[req.status] = (analytics.by_status[req.status] || 0) + 1;
      analytics.by_priority[req.priority] = (analytics.by_priority[req.priority] || 0) + 1;

      if (req.rating) {
        totalRating += req.rating;
        ratedCount++;
      }

      if (req.status === 'resolved' || req.status === 'closed') {
        completed++;
      }
    });

    if (ratedCount > 0) {
      analytics.average_rating = (totalRating / ratedCount).toFixed(2);
      analytics.total_reviews = ratedCount;
    }

    analytics.completion_rate = ((completed / (analytics.total || 1)) * 100).toFixed(2);

    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// Get Technician Performance
router.get('/analytics/technicians', requireAdmin, requirePermission('reports'), async (req, res) => {
  try {
    const { data: technicians } = await supabase
      .from('technicians')
      .select(`
        id,
        full_name,
        specialization,
        service_requests:assigned_technician_id (id, status, rating, created_at, updated_at)
      `);

    const performance = technicians?.map(tech => {
      const requests = tech.service_requests || [];
      const completed = requests.filter(r => r.status === 'resolved' || r.status === 'closed').length;
      const ratings = requests.map(r => Number(r.rating)).filter(r => r > 0);

      return {
        id: tech.id,
        full_name: tech.full_name,
        specialization: tech.specialization,
        rating: ratings.length ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2) : null,
        total_requests: requests.length,
        completed_requests: completed,
        completion_rate: ((completed / (requests.length || 1)) * 100).toFixed(2)
      };
    }) || [];

    res.json({ success: true, data: performance });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// ============================================
// "VIEW AS TECHNICIAN" PASSWORD CHECK
// ============================================

// An admin who wants to switch into a technician's view must prove they know
// that technician's password first. Returns the same generic error for a wrong
// password, a missing technician, or a technician who has no password set, so
// this endpoint cannot be used to enumerate accounts.
router.post('/verify-technician-password', requireAdmin, async (req, res) => {
  try {
    const { technicianId, password } = req.body || {};

    if (!technicianId || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ success: false, error: 'technicianId and password are required' });
    }

    const { rows } = await query(
      'SELECT password_hash FROM technicians WHERE id = $1 AND is_active = true',
      [technicianId]
    );

    const hash = rows[0]?.password_hash;
    const ok = hash ? await bcrypt.compare(password, hash) : false;

    if (!ok) {
      return res.status(401).json({ success: false, error: 'Incorrect password for this technician.' });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// ============================================
// DASHBOARD CONFIGURATION (single shared row)
// ============================================

router.get('/settings', requireAdmin, requirePermission('settings'), async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT enabled_modules, role_permissions, updated_at FROM app_settings WHERE id = 1'
    );

    if (!rows[0]) {
      return res.json({ success: true, data: { enabled_modules: {}, role_permissions: {} } });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

router.put('/settings', requireAdmin, requirePermission('settings'), async (req, res) => {
  try {
    const { enabled_modules, role_permissions } = req.body || {};

    const isPlainObject = (value) =>
      value !== null && typeof value === 'object' && !Array.isArray(value);

    if (enabled_modules !== undefined && !isPlainObject(enabled_modules)) {
      return res.status(400).json({ success: false, error: 'enabled_modules must be an object' });
    }
    if (role_permissions !== undefined && !isPlainObject(role_permissions)) {
      return res.status(400).json({ success: false, error: 'role_permissions must be an object' });
    }

    const { rows } = await query(
      `INSERT INTO app_settings (id, enabled_modules, role_permissions, updated_at)
       VALUES (1, COALESCE($1::jsonb, '{}'::jsonb), COALESCE($2::jsonb, '{}'::jsonb), now())
       ON CONFLICT (id) DO UPDATE SET
         enabled_modules  = COALESCE($1::jsonb, app_settings.enabled_modules),
         role_permissions = COALESCE($2::jsonb, app_settings.role_permissions),
         updated_at       = now()
       RETURNING enabled_modules, role_permissions, updated_at`,
      [
        enabled_modules === undefined ? null : JSON.stringify(enabled_modules),
        role_permissions === undefined ? null : JSON.stringify(role_permissions)
      ]
    );

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// ============================================
// ADMIN ROSTER (Admin Roles page — "Add Admin" / "Admin Roster")
// ============================================

// Admins onboarded through the dashboard get this password until they change
// it; it is hashed like any other, never stored in plain text. Mirrors
// technicians.js's DEFAULT_TECHNICIAN_PASSWORD pattern.
const DEFAULT_ADMIN_PASSWORD = '123456';

// Admin RBAC V1 (TaskPro_Sales_RBAC_plan.md) — canonical module keys a
// normal admin's access can be toggled on/off for. Mirrors the `module`
// values already used by the frontend's adminNavItems.js so a permission
// row always lines up with a real nav entry. 'sales' is included ahead of
// the Sales module itself shipping (plan §2) so the toggle exists from day
// one; no route enforces it yet.
const ADMIN_MODULES = [
  'requests', 'projects', 'customers', 'rooms', 'technicians', 'sales',
  'installations', 'inventory', 'demos', 'calendar', 'history', 'reports',
  'settings'
];

// Admin management (roster list/create/edit/deactivate/delete, promote/
// demote, per-module permission toggles) is Super-Admin-only end to end —
// not something a normal admin can be granted via admin_permissions, per
// the plan's "Cannot manage Admins or permissions unless explicitly
// permitted" (the only thing that can permit it is being Super Admin).

// Public roster fields only — password hashes are never selected.
router.get('/admins', requireSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id, email, full_name, department, is_active, is_super_admin, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/admins', requireSuperAdmin, async (req, res) => {
  try {
    const { full_name, email, department } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ success: false, error: 'full_name and email are required' });
    }

    // Audit fix P2-2 — admins_email_lower_unique enforces uniqueness on
    // lower(email), but this pre-check used to be an exact-match .eq(),
    // so a case-variant duplicate (e.g. "Admin@Example.com" vs
    // "admin@example.com") sailed past it and hit the DB constraint
    // directly, surfacing as a raw 500 with the internal constraint name
    // instead of this clean 400. Mirrors routes/sales.js's existing,
    // correct handling of the identical scenario.
    const { data: existing } = await supabase
      .from('admins')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (existing) {
      return res.status(400).json({ success: false, error: 'Admin with this email already exists' });
    }

    // Always store a real bcrypt hash — an empty/plaintext value would make
    // the account impossible to log into.
    const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);

    // New admins are never created as Super Admin through this endpoint —
    // promotion is its own explicit, separate action (PATCH .../super-admin)
    // so a Super Admin always has to make that call on purpose.
    const { data, error } = await supabase
      .from('admins')
      .insert([{
        full_name,
        email,
        department: department || null,
        password_hash: passwordHash,
        is_active: true,
        is_super_admin: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select('id, email, full_name, department, is_active, is_super_admin, created_at')
      .single();
    if (error) {
      // Belt-and-suspenders for the narrow race between the check above and
      // this insert (two concurrent requests for the same email) — same
      // pattern as routes/sales.js.
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'Admin with this email already exists' });
      }
      throw error;
    }

    res.status(201).json({ success: true, data, message: 'Admin created successfully' });
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Edit an admin's own profile fields. Deliberately does not touch
// is_active or is_super_admin — those are their own explicit actions below
// so each has its own audit trail and safety checks.
router.put('/admins/:id', requireSuperAdmin, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, department } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ success: false, error: 'full_name and email are required' });
    }

    // Audit fix P2-2 — same case-insensitive pre-check as POST /admins above.
    const { data: existing } = await supabase
      .from('admins')
      .select('id')
      .neq('id', id)
      .ilike('email', email)
      .maybeSingle();
    if (existing) {
      return res.status(400).json({ success: false, error: 'Admin with this email already exists' });
    }

    const { data, error } = await supabase
      .from('admins')
      .update({ full_name, email, department: department || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, email, full_name, department, is_active, is_super_admin, created_at')
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'Admin with this email already exists' });
      }
      throw error;
    }
    if (!data) return res.status(404).json({ success: false, error: 'Admin not found' });

    res.json({ success: true, data, message: 'Admin updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Audit fix P0-2 — the last-active-Super-Admin protection used to be a
// plain SELECT (count) followed by a separate UPDATE, with no locking
// between them. Two concurrent requests targeting *different* admins (e.g.
// A demotes B while B simultaneously demotes A) could each read "1 other
// active Super Admin remains" before either UPDATE committed, and both
// proceed — empirically reproduced zeroing out every Super Admin via
// demote, and destroying every admin account entirely via the same race on
// DELETE. Every deactivate/delete/demote handler below now runs its
// check-then-act sequence inside one transaction that first takes a
// `SELECT ... FOR UPDATE` lock on the whole (small) admins table: a second,
// concurrent transaction doing the same blocks until the first commits or
// rolls back, so its own count always reflects the first transaction's
// result rather than stale pre-commit data. See
// integration-tests/rbac-security.test.js for the concurrency regression
// test that exercises exactly this race.
async function withAdminsLocked(callback) {
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM admins FOR UPDATE');
    return callback(client);
  });
}

async function countOtherActiveSuperAdmins(client, excludeId) {
  const { rows } = await client.query(
    'SELECT count(*)::int AS count FROM admins WHERE is_super_admin = true AND is_active = true AND id <> $1',
    [excludeId]
  );
  return rows[0].count;
}

router.patch('/admins/:id/deactivate', requireSuperAdmin, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.userId) {
      return res.status(400).json({ success: false, error: 'You cannot deactivate your own account' });
    }

    const outcome = await withAdminsLocked(async (client) => {
      const { rows: targetRows } = await client.query('SELECT id, is_super_admin FROM admins WHERE id = $1', [id]);
      const target = targetRows[0];
      if (!target) return { status: 404, body: { success: false, error: 'Admin not found' } };

      if (target.is_super_admin && (await countOtherActiveSuperAdmins(client, id)) === 0) {
        return { status: 409, body: { success: false, error: 'Cannot deactivate the last active Super Admin' } };
      }

      // Audit fix P0-1 — bump token_version so this admin's existing
      // access/refresh tokens are rejected on their very next use, instead
      // of remaining valid until natural expiry (up to 7 days).
      const { rows } = await client.query(
        `UPDATE admins SET is_active = false, token_version = token_version + 1, updated_at = now()
         WHERE id = $1
         RETURNING id, email, full_name, department, is_active, is_super_admin, created_at`,
        [id]
      );
      return { status: 200, body: { success: true, data: rows[0], message: 'Admin deactivated' } };
    });

    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/admins/:id/activate', requireSuperAdmin, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('admins')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, email, full_name, department, is_active, is_super_admin, created_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Admin not found' });

    res.json({ success: true, data, message: 'Admin activated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Hard delete. `admins` is referenced by attendance_records
// (marked_absent_by), password_resets (admin_id), and projects
// (responsible_admin_id) — all ON DELETE SET NULL/CASCADE (see migration
// 001), so this cannot fail on foreign-key history the way e.g. a
// technician-with-tickets delete would.
router.delete('/admins/:id', requireSuperAdmin, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.userId) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
    }

    const outcome = await withAdminsLocked(async (client) => {
      const { rows: targetRows } = await client.query('SELECT id, is_super_admin FROM admins WHERE id = $1', [id]);
      const target = targetRows[0];
      if (!target) return { status: 404, body: { success: false, error: 'Admin not found' } };

      if (target.is_super_admin && (await countOtherActiveSuperAdmins(client, id)) === 0) {
        return { status: 409, body: { success: false, error: 'Cannot delete the last active Super Admin' } };
      }

      await client.query('DELETE FROM admins WHERE id = $1', [id]);
      return { status: 200, body: { success: true, message: 'Admin deleted' } };
    });

    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Promote/demote. Body: { is_super_admin: boolean }.
router.patch('/admins/:id/super-admin', requireSuperAdmin, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_super_admin } = req.body || {};

    if (typeof is_super_admin !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_super_admin (boolean) is required' });
    }

    if (id === req.user.userId) {
      return res.status(400).json({ success: false, error: 'You cannot change your own Super Admin status' });
    }

    const outcome = await withAdminsLocked(async (client) => {
      const { rows: targetRows } = await client.query('SELECT id, is_super_admin FROM admins WHERE id = $1', [id]);
      const target = targetRows[0];
      if (!target) return { status: 404, body: { success: false, error: 'Admin not found' } };

      if (!is_super_admin && target.is_super_admin && (await countOtherActiveSuperAdmins(client, id)) === 0) {
        return { status: 409, body: { success: false, error: 'Cannot demote the last active Super Admin' } };
      }

      // Audit fix P0-1 — a promotion or demotion changes effective
      // privilege, so it must invalidate this admin's existing tokens
      // immediately too: a demoted admin's still-valid access token must
      // not keep granting Super Admin power for up to 7 days.
      const { rows } = await client.query(
        `UPDATE admins SET is_super_admin = $2, token_version = token_version + 1, updated_at = now()
         WHERE id = $1
         RETURNING id, email, full_name, department, is_active, is_super_admin, created_at`,
        [id, is_super_admin]
      );
      return {
        status: 200,
        body: { success: true, data: rows[0], message: is_super_admin ? 'Admin promoted to Super Admin' : 'Admin demoted to normal admin' }
      };
    });

    res.status(outcome.status).json(outcome.body);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Per-module permission toggles for one admin. GET returns every known
// module with its current can_access (false for any module with no row yet,
// same default requirePermission applies), so the UI always has a complete
// toggle list to render regardless of what's been set before.
router.get('/admins/:id/permissions', requireSuperAdmin, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: target } = await supabase.from('admins').select('id').eq('id', id).maybeSingle();
    if (!target) return res.status(404).json({ success: false, error: 'Admin not found' });

    const { data, error } = await supabase
      .from('admin_permissions')
      .select('module, can_access')
      .eq('admin_id', id);
    if (error) throw error;

    const byModule = Object.fromEntries((data || []).map((row) => [row.module, row.can_access]));
    const permissions = Object.fromEntries(ADMIN_MODULES.map((module) => [module, byModule[module] === true]));

    res.json({ success: true, data: permissions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Body: { permissions: { [module]: boolean, ... } }. Unknown module keys are
// rejected rather than silently stored, so the toggle list can never drift
// from ADMIN_MODULES.
router.put('/admins/:id/permissions', requireSuperAdmin, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body || {};

    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      return res.status(400).json({ success: false, error: 'permissions object is required' });
    }
    const entries = Object.entries(permissions);
    const unknown = entries.map(([module]) => module).filter((module) => !ADMIN_MODULES.includes(module));
    if (unknown.length) {
      return res.status(400).json({ success: false, error: `Unknown module(s): ${unknown.join(', ')}` });
    }
    if (entries.some(([, value]) => typeof value !== 'boolean')) {
      return res.status(400).json({ success: false, error: 'Every permission value must be a boolean' });
    }

    const { data: target } = await supabase.from('admins').select('id').eq('id', id).maybeSingle();
    if (!target) return res.status(404).json({ success: false, error: 'Admin not found' });

    // Audit fix P2-4 — this used to run one INSERT per module as
    // independent statements outside any transaction: if module 3 of 5
    // failed partway through, 1-2 stayed committed and 4-5 never ran, with
    // no rollback and nothing telling the Super Admin which modules did or
    // didn't actually apply. All-or-nothing now.
    await withTransaction(async (client) => {
      for (const [module, can_access] of entries) {
        await client.query(
          `INSERT INTO admin_permissions (admin_id, module, can_access, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (admin_id, module) DO UPDATE SET can_access = $3, updated_at = now()`,
          [id, module, can_access]
        );
      }
    });

    const { data, error } = await supabase
      .from('admin_permissions')
      .select('module, can_access')
      .eq('admin_id', id);
    if (error) throw error;
    const byModule = Object.fromEntries((data || []).map((row) => [row.module, row.can_access]));
    const result = Object.fromEntries(ADMIN_MODULES.map((module) => [module, byModule[module] === true]));

    res.json({ success: true, data: result, message: 'Permissions updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
