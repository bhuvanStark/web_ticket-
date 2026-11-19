import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import {
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  hashPassword,
  comparePassword,
  requireAuth,
  checkStaffSession
} from '../middleware/auth.js';
import { validateLogin } from '../middleware/validation.js';

const router = express.Router();

// Staff portals (admin, technician, sales, back-office) sign in by emailed
// one-time code only — see routes/passwordReset.js. The password-based
// /admin/login, /technician/login and the unauthenticated /admin/register and
// /technician/register routes were removed: nothing called them, and the
// register routes let anyone create staff accounts. Admins are created by a
// Super Admin (POST /api/admin/admins), technicians by an admin
// (POST /api/technicians).

// ============================================
// CUSTOMER AUTHENTICATION
// ============================================

// Customer Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, company_name, phone, address, city } = req.body;

    if (!email || !password || !name || !company_name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, name, and company_name are required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters'
      });
    }

    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', email)
      .single();

    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered'
      });
    }

    const hashedPassword = await hashPassword(password);

    const { data: newCustomer, error } = await supabase
      .from('customers')
      .insert([{
        email,
        password_hash: hashedPassword,
        name,
        company_name,
        phone: phone || null,
        address: address || null,
        city: city || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    const accessToken = generateToken(newCustomer.id, 'customer');
    const refreshToken = generateRefreshToken(newCustomer.id, 'customer');

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully',
      data: {
        customer: {
          id: newCustomer.id,
          email: newCustomer.email,
          name: newCustomer.name,
          company_name: newCustomer.company_name
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Registration failed'
    });
  }
});

// Customer Login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (customer) {
      if (!customer.password_hash) {
        return res.status(401).json({
          success: false,
          error: 'Account authentication not configured'
        });
      }

      const validPassword = await comparePassword(password, customer.password_hash);
      if (!validPassword) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      const accessToken = generateToken(customer.id, 'customer');
      const refreshToken = generateRefreshToken(customer.id, 'customer');

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          customer: {
            id: customer.id,
            email: customer.email,
            name: customer.name,
            company_name: customer.company_name,
            phone: customer.phone
          },
          accessToken,
          refreshToken
        }
      });
    }

    // Not a primary customer — fall back to an invited team member. Their session
    // acts on the parent customer account, so the JWT carries the parent's id and
    // every existing customer-scoped endpoint resolves to the shared company data.
    const { data: member } = await supabase
      .from('team_members')
      .select('*')
      .eq('email', email)
      .eq('status', 'active')
      .maybeSingle();

    if (!member || !member.password_hash) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const memberPasswordValid = await comparePassword(password, member.password_hash);
    if (!memberPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const { data: parent } = await supabase
      .from('customers')
      .select('id, company_name, phone')
      .eq('id', member.customer_id)
      .single();

    if (!parent) {
      return res.status(401).json({
        success: false,
        error: 'The company account for this member is no longer available'
      });
    }

    const memberAccessToken = generateToken(parent.id, 'customer', { teamMemberId: member.id });
    const memberRefreshToken = generateRefreshToken(parent.id, 'customer', { teamMemberId: member.id });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        customer: {
          id: parent.id,
          email: member.email,
          name: member.full_name,
          company_name: parent.company_name,
          phone: parent.phone,
          team_member_id: member.id,
          job_role: member.job_role,
          access_level: member.access_level,
          is_team_member: true
        },
        accessToken: memberAccessToken,
        refreshToken: memberRefreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Login failed'
    });
  }
});

// Staff profile columns for /me, by JWT role. Customers are handled below.
const STAFF_ME_SELECT = {
  admin: ['admins', 'id, email, full_name, department, is_super_admin, created_at'],
  technician: ['technicians', 'id, email, full_name, phone, specialization, status, rating, created_at'],
  sales: ['sales', 'id, email, full_name, phone, location, created_at'],
  back_office: ['back_office', 'id, email, full_name, phone, location, created_at']
};

// GET /api/auth/me - Get current user info for any portal. (There used to be
// a second, staff-only /me further down this file that Express never
// reached, so admin and technician tokens always got "Customer not found".)
router.get('/me', verifyToken, async (req, res) => {
  try {
    const staff = STAFF_ME_SELECT[req.user?.role];
    if (staff) {
      const [table, columns] = staff;
      const { data: user } = await supabase
        .from(table)
        .select(columns)
        .eq('id', req.userId)
        .maybeSingle();
      if (!user) {
        return res.status(404).json({ success: false, error: 'Not Found', message: 'User not found' });
      }
      return res.json({ success: true, data: { ...user, role: req.user.role } });
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, email, name, company_name, phone, address, city, created_at')
      .eq('id', req.userId)
      .single();

    if (error || !customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Team-member sessions scope to the parent customer but should still show
    // the member's own name/email/role in the UI.
    if (req.user?.teamMemberId) {
      const { data: member } = await supabase
        .from('team_members')
        .select('id, full_name, email, job_role, access_level, status')
        .eq('id', req.user.teamMemberId)
        .maybeSingle();

      if (member && member.status === 'active') {
        return res.json({
          success: true,
          data: {
            ...customer,
            name: member.full_name,
            email: member.email,
            team_member_id: member.id,
            job_role: member.job_role,
            access_level: member.access_level,
            is_team_member: true
          }
        });
      }
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch user info'
    });
  }
});

// GET /api/auth/session - Lightweight "is my token still valid" check that works
// for any portal (customer, admin, technician). Unlike /me it does not assume the
// customers table; each frontend calls this on startup to decide whether to
// restore a stored session or fall back to the login screen.
router.get('/session', verifyToken, async (req, res) => {
  try {
    const role = req.user?.role || null;
    // Sales & Back-Office Roles V1 — every portal restores its session
    // through this one endpoint (unifiedClient.getSession()), so a Sales or
    // Back-Office JWT must resolve to its own identity table here too, or
    // session restore silently falls through to `customers` and 401s on
    // every page refresh.
    const table = role === 'admin' ? 'admins'
      : role === 'technician' ? 'technicians'
      : role === 'sales' ? 'sales'
      : role === 'back_office' ? 'back_office'
      : 'customers';
    const nameColumn = table === 'customers' ? 'name' : 'full_name';
    // Admin RBAC V1 — session restore is where the frontend re-derives
    // is_super_admin after a page refresh (AppContext reads this, not just
    // the JWT), so the admins table needs is_super_admin in the select too.
    // Audit fix P0-1 — also select is_active for admin/sales so a
    // deactivated account's session correctly reports itself as no longer
    // valid here too, not just at the API layer (requireAdmin/
    // requireSales already reject the underlying token regardless).
    // Staff removal (migration 040) — same for technicians/back_office.
    const selectColumns = table === 'admins' ? `id, email, ${nameColumn}, is_super_admin, is_active`
      : ['sales', 'technicians', 'back_office'].includes(table) ? `id, email, ${nameColumn}, is_active`
      : `id, email, ${nameColumn}`;

    const { data: account, error } = await supabase
      .from(table)
      .select(selectColumns)
      .eq('id', req.userId)
      .maybeSingle();

    if (error || !account || account.is_active === false) {
      return res.status(401).json({ success: false, error: 'Session no longer valid' });
    }

    res.json({
      success: true,
      data: {
        id: account.id,
        email: account.email,
        name: account[nameColumn],
        role,
        teamMemberId: req.user?.teamMemberId || null,
        is_super_admin: table === 'admins' ? account.is_super_admin === true : undefined
      }
    });
  } catch (error) {
    console.error('Session check failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    const decoded = verifyRefreshToken(refreshToken);

    // Preserve team-member identity across refresh, otherwise the session would
    // silently fall back to the parent customer account.
    const extraClaims = { ...(decoded.teamMemberId ? { teamMemberId: decoded.teamMemberId } : {}) };

    // Audit fix P2-3/P0-1 — admin and Sales refresh tokens must be
    // re-validated against live DB state on every refresh, not just have
    // their old claims copied forward: (a) isSuperAdmin used to be copied
    // from the *old* token, so a promotion/demotion that happened after the
    // refresh token was issued had no effect until a full re-login; (b) an
    // inactive account or a stale token_version (deactivated, promoted,
    // demoted since this refresh token was issued) must not be able to mint
    // a fresh access token just by holding an old refresh token — otherwise
    // revocation would be trivially bypassable by never letting the access
    // token expire.
    if (decoded.role === 'admin') {
      const { data: admin } = await supabase
        .from('admins')
        .select('is_active, is_super_admin, token_version')
        .eq('id', decoded.userId)
        .maybeSingle();
      if (!admin || !admin.is_active) {
        return res.status(401).json({ success: false, error: 'Unauthorized', message: 'This account is inactive or no longer exists' });
      }
      if (admin.token_version !== decoded.tokenVersion) {
        return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Your session has been revoked — please log in again' });
      }
      extraClaims.isSuperAdmin = admin.is_super_admin === true;
      extraClaims.tokenVersion = admin.token_version;
    } else if (decoded.role === 'sales') {
      const { data: sales } = await supabase
        .from('sales')
        .select('is_active, token_version')
        .eq('id', decoded.userId)
        .maybeSingle();
      if (!sales || !sales.is_active) {
        return res.status(401).json({ success: false, error: 'Unauthorized', message: 'This account is inactive or no longer exists' });
      }
      if (sales.token_version !== decoded.tokenVersion) {
        return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Your session has been revoked — please log in again' });
      }
      extraClaims.tokenVersion = sales.token_version;
    } else if (decoded.role === 'technician' || decoded.role === 'back_office') {
      // Staff removal (migration 040) — a removed employee's refresh token
      // must not mint a new access token.
      const revoked = await checkStaffSession(decoded);
      if (revoked) {
        return res.status(401).json({ success: false, error: 'Unauthorized', message: revoked });
      }
      extraClaims.tokenVersion = decoded.tokenVersion ?? 0;
    }

    const newAccessToken = generateToken(decoded.userId, decoded.role, extraClaims);

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired refresh token'
    });
  }
});


// Logout
router.post('/logout', requireAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Change Password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { userId, role } = req.user;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'currentPassword and newPassword are required'
      });
    }

    // Only admins and technicians have a password column at all. A customer
    // token used to fall through to the technicians table here.
    const table = role === 'admin' ? 'admins' : role === 'technician' ? 'technicians' : null;
    if (!table) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'This account signs in with an emailed code and has no password to change'
      });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'newPassword must be at least 8 characters'
      });
    }
    const { data: user } = await supabase
      .from(table)
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'User not found'
      });
    }

    // Verify current password
    const passwordMatch = await comparePassword(currentPassword, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    const { error } = await supabase
      .from(table)
      .update({ password_hash: hashedPassword })
      .eq('id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

export default router;
