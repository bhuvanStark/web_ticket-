import express from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabaseClient.js';
import {
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  hashPassword,
  comparePassword,
  requireAuth
} from '../middleware/auth.js';
import {
  validateAdminLogin,
  validateTechnicianLogin,
  validateAdminRegistration,
  validateTechnicianRegistration,
  validateLogin,
  validateServiceRequest
} from '../middleware/validation.js';

const router = express.Router();

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

// GET /api/auth/me - Get current user info
router.get('/me', verifyToken, async (req, res) => {
  try {
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
    const table = role === 'admin' ? 'admins'
      : role === 'technician' ? 'technicians'
      : 'customers';
    const nameColumn = table === 'customers' ? 'name' : 'full_name';

    const { data: account, error } = await supabase
      .from(table)
      .select(`id, email, ${nameColumn}`)
      .eq('id', req.userId)
      .maybeSingle();

    if (error || !account) {
      return res.status(401).json({ success: false, error: 'Session no longer valid' });
    }

    res.json({
      success: true,
      data: {
        id: account.id,
        email: account.email,
        name: account[nameColumn],
        role,
        teamMemberId: req.user?.teamMemberId || null
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
    const extraClaims = decoded.teamMemberId ? { teamMemberId: decoded.teamMemberId } : {};
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

// ============================================
// ADMIN AUTHENTICATION
// ============================================

// Admin Register
router.post('/admin/register', validateAdminRegistration, async (req, res) => {
  try {
    const { email, password, full_name, department } = req.body;

    // Check if admin already exists
    const { data: existing } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Admin with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create admin
    const { data: admin, error } = await supabase
      .from('admins')
      .insert([
        {
          email,
          password_hash: hashedPassword,
          full_name,
          department,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Generate tokens
    const accessToken = generateToken(admin.id, 'admin');
    const refreshToken = generateRefreshToken(admin.id, 'admin');

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      data: {
        admin: {
          id: admin.id,
          email: admin.email,
          full_name: admin.full_name,
          department: admin.department
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error.message
    });
  }
});

// Admin Login
router.post('/admin/login', validateAdminLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find admin
    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !admin) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    // Compare password
    const passwordMatch = await comparePassword(password, admin.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    // Generate tokens
    const accessToken = generateToken(admin.id, 'admin');
    const refreshToken = generateRefreshToken(admin.id, 'admin');

    res.json({
      success: true,
      message: 'Admin login successful',
      data: {
        admin: {
          id: admin.id,
          email: admin.email,
          full_name: admin.full_name,
          department: admin.department
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: error.message
    });
  }
});

// ============================================
// TECHNICIAN AUTHENTICATION
// ============================================

// Technician Register
router.post('/technician/register', validateTechnicianRegistration, async (req, res) => {
  try {
    const { email, password, full_name, phone, specialization } = req.body;

    // Check if technician already exists
    const { data: existing } = await supabase
      .from('technicians')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Technician with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create technician
    const { data: technician, error } = await supabase
      .from('technicians')
      .insert([
        {
          email,
          password_hash: hashedPassword,
          full_name,
          phone,
          specialization,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Generate tokens
    const accessToken = generateToken(technician.id, 'technician');
    const refreshToken = generateRefreshToken(technician.id, 'technician');

    res.status(201).json({
      success: true,
      message: 'Technician registered successfully',
      data: {
        technician: {
          id: technician.id,
          email: technician.email,
          full_name: technician.full_name,
          phone: technician.phone,
          specialization: technician.specialization
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Technician registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error.message
    });
  }
});

// Technician Login
router.post('/technician/login', validateTechnicianLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find technician
    const { data: technician, error } = await supabase
      .from('technicians')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !technician) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    // Compare password
    const passwordMatch = await comparePassword(password, technician.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    // Generate tokens
    const accessToken = generateToken(technician.id, 'technician');
    const refreshToken = generateRefreshToken(technician.id, 'technician');

    res.json({
      success: true,
      message: 'Technician login successful',
      data: {
        technician: {
          id: technician.id,
          email: technician.email,
          full_name: technician.full_name,
          phone: technician.phone,
          specialization: technician.specialization
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Technician login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: error.message
    });
  }
});

// ============================================
// SHARED ENDPOINTS
// ============================================

// Refresh Token (both admin and technician)
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Refresh token is required'
      });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const newAccessToken = generateToken(decoded.userId, decoded.role);

    res.json({
      success: true,
      data: { accessToken: newAccessToken }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired refresh token'
    });
  }
});

// Get Current User (admin or technician)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { userId, role } = req.user;

    let user;
    if (role === 'admin') {
      const { data } = await supabase
        .from('admins')
        .select('id, email, full_name, department, created_at')
        .eq('id', userId)
        .single();
      user = data;
    } else if (role === 'technician') {
      const { data } = await supabase
        .from('technicians')
        .select('id, email, full_name, phone, specialization, status, rating, created_at')
        .eq('id', userId)
        .single();
      user = data;
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        ...user,
        role
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

    // Get user
    const table = role === 'admin' ? 'admins' : 'technicians';
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
