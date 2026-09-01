import express from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabaseClient.js';
import { query } from '../config/database.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateUUID, validateStatusUpdate, validateAssignTechnician, validatePagination } from '../middleware/validation.js';

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

router.get('/companies', requireAdmin, async (req, res) => {
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

router.get('/export/customers', requireAdmin, async (req, res) => {
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

router.get('/export/technicians', requireAdmin, async (req, res) => {
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
router.get('/service-requests', requireAdmin, validatePagination, async (req, res) => {
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
router.get('/service-requests/:id', requireAdmin, validateUUID, async (req, res) => {
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
router.post('/service-requests/:id/assign', requireAdmin, validateUUID, validateAssignTechnician, async (req, res) => {
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
router.patch('/service-requests/:id/status', requireAdmin, validateUUID, validateStatusUpdate, async (req, res) => {
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
router.get('/technicians', requireAdmin, validatePagination, async (req, res) => {
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
router.get('/technicians/:id', requireAdmin, validateUUID, async (req, res) => {
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

// Update Technician Status
router.patch('/technicians/:id/status', requireAdmin, validateUUID, async (req, res) => {
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
router.get('/analytics/service-requests', requireAdmin, async (req, res) => {
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
router.get('/analytics/technicians', requireAdmin, async (req, res) => {
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

router.get('/settings', requireAdmin, async (req, res) => {
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

router.put('/settings', requireAdmin, async (req, res) => {
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

export default router;
