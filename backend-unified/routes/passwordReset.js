import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabaseClient.js';
import { hashPassword, requireAdmin, generateToken, generateRefreshToken } from '../middleware/auth.js';
import { sendResetApprovalEmail, sendResetLinkEmail, sendLoginOtpEmail } from '../services/emailService.js';

const router = express.Router();

const APPROVAL_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;
// All three portals (customer, admin, technician) now sign in by emailed OTP
// only — no password. The code is short-lived and single-use.
const LOGIN_OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const minutesFromNow = (m) => new Date(Date.now() + m * 60 * 1000).toISOString();
const generateOtp = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

// Shared OTP request + verify for the admin and technician portals, which sign
// in by emailed code only (no password). The config maps a portal to its table,
// owner column, JWT role, and the fields the client needs.
function buildOtpFlow({ table, ownerColumn, jwtRole, publicKey, selectFields }) {
  const requestOtp = async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !EMAIL_REGEX.test(email)) {
        return res.status(400).json({ success: false, error: 'A valid email address is required' });
      }

      const { data: account } = await supabase
        .from(table).select(`id, email, is_active, ${selectFields}`).eq('email', email).maybeSingle();

      if (!account || account.is_active === false) {
        return res.status(404).json({ success: false, error: 'No account found with that email address.' });
      }

      await supabase.from('password_resets')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq(ownerColumn, account.id).in('status', ['pending', 'approved']);

      const otp = generateOtp();
      const otpHash = await bcrypt.hash(otp, 10);

      const { error: insertError } = await supabase.from('password_resets').insert([{
        [ownerColumn]: account.id,
        email: account.email,
        otp_hash: otpHash,
        otp_expires_at: minutesFromNow(LOGIN_OTP_TTL_MINUTES),
        otp_attempts: 0,
        status: 'pending',
        requested_ip: req.ip || null
      }]);
      if (insertError) throw insertError;

      try {
        await sendLoginOtpEmail({
          customerEmail: account.email,
          customerName: account.full_name || account.name,
          otp
        });
      } catch (emailError) {
        console.error(`Failed to email the ${jwtRole} sign-in OTP:`, emailError);
      }

      res.json({ success: true, message: 'A sign-in code has been emailed to you.' });
    } catch (error) {
      console.error(`${jwtRole} OTP request failed:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  };

  const verifyOtp = async (req, res) => {
    try {
      const { email, otp } = req.body;
      if (!email || !EMAIL_REGEX.test(email) || !/^\d{4}$/.test(String(otp || ''))) {
        return res.status(400).json({ success: false, error: 'Enter the 4-digit code sent to your email.' });
      }

      const { data: account } = await supabase
        .from(table).select(`id, email, ${selectFields}`).eq('email', email).maybeSingle();

      const invalid = { success: false, error: 'That code is incorrect or has expired. Request a new one.' };
      if (!account) return res.status(400).json(invalid);

      const { data: request } = await supabase.from('password_resets')
        .select('*').eq(ownerColumn, account.id).eq('status', 'pending')
        .order('created_at', { ascending: false }).maybeSingle();

      if (!request || !request.otp_hash) return res.status(400).json(invalid);

      if (new Date(request.otp_expires_at) < new Date()) {
        await supabase.from('password_resets')
          .update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', request.id);
        return res.status(400).json(invalid);
      }

      if ((request.otp_attempts || 0) >= OTP_MAX_ATTEMPTS) {
        await supabase.from('password_resets')
          .update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', request.id);
        return res.status(429).json({ success: false, error: 'Too many attempts. Request a new code.' });
      }

      const matches = await bcrypt.compare(String(otp), request.otp_hash);
      if (!matches) {
        await supabase.from('password_resets')
          .update({ otp_attempts: (request.otp_attempts || 0) + 1, updated_at: new Date().toISOString() })
          .eq('id', request.id);
        return res.status(400).json(invalid);
      }

      await supabase.from('password_resets').update({
        status: 'completed',
        consumed_at: new Date().toISOString(),
        otp_hash: null,
        otp_expires_at: null,
        updated_at: new Date().toISOString()
      }).eq('id', request.id);

      const accessToken = generateToken(account.id, jwtRole);
      const refreshToken = generateRefreshToken(account.id, jwtRole);

      res.json({
        success: true,
        message: 'Signed in successfully.',
        data: { [publicKey]: account, accessToken, refreshToken }
      });
    } catch (error) {
      console.error(`${jwtRole} OTP verification failed:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  };

  return { requestOtp, verifyOtp };
}

const adminOtp = buildOtpFlow({
  table: 'admins', ownerColumn: 'admin_id', jwtRole: 'admin', publicKey: 'admin',
  selectFields: 'full_name, department'
});
const technicianOtp = buildOtpFlow({
  table: 'technicians', ownerColumn: 'technician_id', jwtRole: 'technician', publicKey: 'technician',
  selectFields: 'full_name, phone, specialization'
});

router.post('/admin/request-otp', adminOtp.requestOtp);
router.post('/admin/verify-otp', adminOtp.verifyOtp);
router.post('/technician/request-otp', technicianOtp.requestOtp);
router.post('/technician/verify-otp', technicianOtp.verifyOtp);

const appUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';
// The admin dashboard is a separate app on its own port.
const adminAppUrl = () => process.env.ADMIN_APP_URL || 'http://localhost:5173';
const apiUrl = (req) => `${req.protocol}://${req.get('host')}`;
const adminEmail = () =>
  process.env.ADMIN_EMAIL || process.env.SMTP_USER || process.env.GMAIL_USER;

const hoursFromNow = (h) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

// A small self-contained HTML page, used for the links the admin opens directly
// in a browser (there is no admin SPA route for this).
const htmlPage = ({ title, message, tone = 'ok' }) => `
  <!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; display: grid; place-items: center; min-height: 100vh; padding: 20px; }
    .card { background: #fff; border: 1px solid #e4e7ec; border-radius: 12px; max-width: 460px; padding: 32px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,.06); }
    h1 { font-size: 19px; margin: 0 0 10px; color: ${tone === 'ok' ? '#067647' : '#B42318'}; }
    p { font-size: 14px; color: #475467; line-height: 1.5; margin: 0; }
  </style></head>
  <body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>
`;

// ============================================
// CUSTOMER PORTAL SIGN-IN — the customer portal has no password. Sign-in is:
//   1. POST /request       — email a 4-digit code
//   2. POST /verify-otp    — check the code, issue tokens
// The email may belong to a primary customer or to an invited team member; a
// team member's session scopes to the parent customer account (JWT carries the
// parent id plus a teamMemberId claim), exactly as /api/auth/login does.
// ============================================

// Resolve a login email to either a primary customer or an active team member.
// Returns { kind: 'customer', account } | { kind: 'team_member', member, parent } | null
async function resolveLoginAccount(email) {
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, email, company_name, phone')
    .eq('email', email)
    .maybeSingle();
  if (customer) return { kind: 'customer', account: customer };

  const { data: member } = await supabase
    .from('team_members')
    .select('id, customer_id, full_name, email, job_role, access_level, status')
    .eq('email', email)
    .eq('status', 'active')
    .maybeSingle();
  if (!member) return null;

  const { data: parent } = await supabase
    .from('customers')
    .select('id, name, email, company_name, phone')
    .eq('id', member.customer_id)
    .maybeSingle();
  if (!parent) return null;

  return { kind: 'team_member', member, parent };
}

// The password_resets column that owns this login's OTP row.
const ownerColumnFor = (resolved) =>
  resolved.kind === 'customer' ? 'customer_id' : 'team_member_id';
const ownerIdFor = (resolved) =>
  resolved.kind === 'customer' ? resolved.account.id : resolved.member.id;

// STAGE 1: email a 4-digit sign-in code.
router.post('/request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required' });
    }

    const resolved = await resolveLoginAccount(email);
    if (!resolved) {
      return res.status(404).json({ success: false, error: 'No account found with that email address.' });
    }

    const ownerColumn = ownerColumnFor(resolved);
    const ownerId = ownerIdFor(resolved);
    const targetEmail = resolved.kind === 'customer' ? resolved.account.email : resolved.member.email;
    const targetName = resolved.kind === 'customer' ? resolved.account.name : resolved.member.full_name;

    // Drop any earlier unused code for this account.
    await supabase
      .from('password_resets')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq(ownerColumn, ownerId)
      .in('status', ['pending', 'approved']);

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    const { error: insertError } = await supabase
      .from('password_resets')
      .insert([{
        [ownerColumn]: ownerId,
        email: targetEmail,
        otp_hash: otpHash,
        otp_expires_at: minutesFromNow(LOGIN_OTP_TTL_MINUTES),
        otp_attempts: 0,
        status: 'pending',
        requested_ip: req.ip || null
      }]);

    if (insertError) throw insertError;

    try {
      await sendLoginOtpEmail({ customerEmail: targetEmail, customerName: targetName, otp });
    } catch (emailError) {
      console.error('Failed to email the sign-in OTP:', emailError);
    }

    res.json({ success: true, message: 'A sign-in code has been emailed to you.' });
  } catch (error) {
    console.error('Sign-in code request failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// STAGE 2: verify the code and sign the user in.
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !EMAIL_REGEX.test(email) || !/^\d{4}$/.test(String(otp || ''))) {
      return res.status(400).json({ success: false, error: 'Enter the 4-digit code sent to your email.' });
    }

    const resolved = await resolveLoginAccount(email);
    const invalid = { success: false, error: 'That code is incorrect or has expired. Request a new one.' };
    if (!resolved) return res.status(400).json(invalid);

    const ownerColumn = ownerColumnFor(resolved);
    const ownerId = ownerIdFor(resolved);

    const { data: request } = await supabase
      .from('password_resets')
      .select('*')
      .eq(ownerColumn, ownerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (!request || !request.otp_hash) return res.status(400).json(invalid);

    if (new Date(request.otp_expires_at) < new Date()) {
      await supabase.from('password_resets')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', request.id);
      return res.status(400).json(invalid);
    }

    if ((request.otp_attempts || 0) >= OTP_MAX_ATTEMPTS) {
      await supabase.from('password_resets')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', request.id);
      return res.status(429).json({ success: false, error: 'Too many attempts. Request a new code.' });
    }

    const matches = await bcrypt.compare(String(otp), request.otp_hash);
    if (!matches) {
      await supabase.from('password_resets')
        .update({ otp_attempts: (request.otp_attempts || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', request.id);
      return res.status(400).json(invalid);
    }

    // Code good — burn it so it cannot be reused.
    await supabase
      .from('password_resets')
      .update({
        status: 'completed',
        consumed_at: new Date().toISOString(),
        otp_hash: null,
        otp_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', request.id);

    if (resolved.kind === 'customer') {
      const c = resolved.account;
      const accessToken = generateToken(c.id, 'customer');
      const refreshToken = generateRefreshToken(c.id, 'customer');
      return res.json({
        success: true,
        message: 'Signed in successfully.',
        data: {
          customer: {
            id: c.id, email: c.email, name: c.name,
            company_name: c.company_name, phone: c.phone
          },
          accessToken,
          refreshToken
        }
      });
    }

    // Team member: scope the session to the parent customer account.
    const { member, parent } = resolved;
    const accessToken = generateToken(parent.id, 'customer', { teamMemberId: member.id });
    const refreshToken = generateRefreshToken(parent.id, 'customer', { teamMemberId: member.id });
    res.json({
      success: true,
      message: 'Signed in successfully.',
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
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Sign-in code verification failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// STAGE 2 — admin approves, customer gets the link
// Opened directly from the admin's email, so it responds with HTML.
// ============================================
router.get('/approve/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: request } = await supabase
      .from('password_resets')
      .select('*')
      .eq('approval_token', token)
      .maybeSingle();

    if (!request) {
      return res.status(404).send(htmlPage({
        title: 'Link not valid',
        message: 'This approval link is not recognised. It may already have been used.',
        tone: 'error'
      }));
    }

    if (request.status !== 'pending') {
      return res.status(400).send(htmlPage({
        title: 'Already handled',
        message: 'This reset request has already been processed.',
        tone: 'error'
      }));
    }

    if (new Date(request.approval_expires_at) < new Date()) {
      await supabase
        .from('password_resets')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', request.id);

      return res.status(410).send(htmlPage({
        title: 'Approval link expired',
        message: `Approval links are valid for ${APPROVAL_TTL_HOURS} hours. Ask the user to request a new reset.`,
        tone: 'error'
      }));
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, email')
      .eq('id', request.customer_id)
      .maybeSingle();

    if (!customer) {
      return res.status(404).send(htmlPage({
        title: 'Account not found',
        message: 'The account for this request no longer exists.',
        tone: 'error'
      }));
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    const { error: updateError } = await supabase
      .from('password_resets')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approval_token: null,
        reset_token: resetToken,
        reset_expires_at: hoursFromNow(RESET_TTL_HOURS),
        updated_at: new Date().toISOString()
      })
      .eq('id', request.id);

    if (updateError) throw updateError;

    const resetUrl = `${appUrl()}/reset-password?token=${resetToken}`;

    await sendResetLinkEmail({
      customerEmail: customer.email,
      customerName: customer.name,
      resetUrl
    });

    res.send(htmlPage({
      title: 'Reset link sent',
      message: `A password reset link has been emailed to ${customer.email}. It expires in ${RESET_TTL_HOURS} hour.`
    }));
  } catch (error) {
    console.error('Password reset approval failed:', error);
    res.status(500).send(htmlPage({
      title: 'Something went wrong',
      message: error.message,
      tone: 'error'
    }));
  }
});

// ============================================
// ADMIN QUEUE — customer reset requests awaiting approval, shown in the
// admin dashboard so an admin does not have to work out of their inbox.
// ============================================
router.get('/admin/pending', requireAdmin, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('password_resets')
      .select('id, email, status, created_at, approval_expires_at, customer_id')
      .eq('status', 'pending')
      .not('customer_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Attach who the requester is, for display.
    const customerIds = [...new Set((rows || []).map((r) => r.customer_id))];
    let customersById = {};

    if (customerIds.length) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, company_name')
        .in('id', customerIds);

      customersById = Object.fromEntries((customers || []).map((c) => [c.id, c]));
    }

    const now = Date.now();
    const data = (rows || []).map((row) => ({
      id: row.id,
      email: row.email,
      status: row.status,
      created_at: row.created_at,
      expires_at: row.approval_expires_at,
      is_expired: new Date(row.approval_expires_at).getTime() < now,
      customer_name: customersById[row.customer_id]?.name || null,
      company_name: customersById[row.customer_id]?.company_name || null
    }));

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('Failed to list pending resets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve from inside the dashboard (JSON), as opposed to the emailed link.
router.post('/admin/pending/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: request } = await supabase
      .from('password_resets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!request) {
      return res.status(404).json({ success: false, error: 'Reset request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'This request has already been processed' });
    }
    if (new Date(request.approval_expires_at) < new Date()) {
      await supabase
        .from('password_resets')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', id);
      return res.status(410).json({ success: false, error: 'This request has expired. Ask the user to request a new reset.' });
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, email')
      .eq('id', request.customer_id)
      .maybeSingle();

    if (!customer) {
      return res.status(404).json({ success: false, error: 'The account for this request no longer exists' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    const { error: updateError } = await supabase
      .from('password_resets')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approval_token: null,
        reset_token: resetToken,
        reset_expires_at: hoursFromNow(RESET_TTL_HOURS),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    const resetUrl = `${appUrl()}/reset-password?token=${resetToken}`;

    let emailSent = false;
    try {
      const result = await sendResetLinkEmail({
        customerEmail: customer.email,
        customerName: customer.name,
        resetUrl
      });
      emailSent = result.sent;
    } catch (emailError) {
      console.error('Approved, but failed to email the reset link:', emailError);
    }

    res.json({
      success: true,
      message: emailSent
        ? `Reset link emailed to ${customer.email}. It expires in ${RESET_TTL_HOURS} hour.`
        : 'Request approved, but the email could not be sent.',
      emailSent
    });
  } catch (error) {
    console.error('Dashboard approval failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reject a request without sending anything.
router.post('/admin/pending/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: request } = await supabase
      .from('password_resets')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!request) {
      return res.status(404).json({ success: false, error: 'Reset request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'This request has already been processed' });
    }

    const { error } = await supabase
      .from('password_resets')
      .update({
        status: 'rejected',
        approval_token: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Request rejected. No reset link was sent.' });
  } catch (error) {
    console.error('Reject failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ADMIN RESET — direct, no approval step
// Admins are the approvers, so there is nobody above them to approve; the
// reset link is emailed straight to the admin's own address.
// ============================================
router.post('/admin/request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required' });
    }

    const { data: admin } = await supabase
      .from('admins')
      .select('id, email, full_name, is_active')
      .eq('email', email)
      .maybeSingle();

    // Same response either way, so this cannot reveal which emails are admins.
    const genericResponse = {
      success: true,
      message: 'If that admin account exists, a password reset link has been emailed to it.'
    };

    if (!admin || admin.is_active === false) return res.json(genericResponse);

    // Drop any earlier unused reset for this admin.
    await supabase
      .from('password_resets')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('admin_id', admin.id)
      .in('status', ['pending', 'approved']);

    const resetToken = crypto.randomBytes(32).toString('hex');

    const { error: insertError } = await supabase
      .from('password_resets')
      .insert([{
        admin_id: admin.id,
        email: admin.email,
        // Straight to approved: there is no separate approval stage for admins.
        status: 'approved',
        approved_at: new Date().toISOString(),
        reset_token: resetToken,
        reset_expires_at: hoursFromNow(RESET_TTL_HOURS),
        requested_ip: req.ip || null
      }]);

    if (insertError) throw insertError;

    const resetUrl = `${adminAppUrl()}/reset-password?token=${resetToken}`;

    try {
      await sendResetLinkEmail({
        customerEmail: admin.email,
        customerName: admin.full_name,
        resetUrl
      });
    } catch (emailError) {
      console.error('Failed to email the admin reset link:', emailError);
    }

    res.json(genericResponse);
  } catch (error) {
    console.error('Admin password reset request failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// TECHNICIAN RESET — direct, no approval step.
// The link is emailed to the technician's own address only.
// ============================================
router.post('/technician/request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required' });
    }

    const { data: technician } = await supabase
      .from('technicians')
      .select('id, email, full_name, is_active')
      .eq('email', email)
      .maybeSingle();

    // Same response either way, so this cannot reveal which addresses exist.
    const genericResponse = {
      success: true,
      message: 'If that technician account exists, a password reset link has been emailed to it.'
    };

    if (!technician || technician.is_active === false) return res.json(genericResponse);

    // Drop any earlier unused reset for this technician.
    await supabase
      .from('password_resets')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('technician_id', technician.id)
      .in('status', ['pending', 'approved']);

    const resetToken = crypto.randomBytes(32).toString('hex');

    const { error: insertError } = await supabase
      .from('password_resets')
      .insert([{
        technician_id: technician.id,
        email: technician.email,
        status: 'approved',
        approved_at: new Date().toISOString(),
        reset_token: resetToken,
        reset_expires_at: hoursFromNow(RESET_TTL_HOURS),
        requested_ip: req.ip || null
      }]);

    if (insertError) throw insertError;

    const resetUrl = `${adminAppUrl()}/reset-password?token=${resetToken}`;

    try {
      await sendResetLinkEmail({
        customerEmail: technician.email,
        customerName: technician.full_name,
        resetUrl
      });
    } catch (emailError) {
      console.error('Failed to email the technician reset link:', emailError);
    }

    res.json(genericResponse);
  } catch (error) {
    console.error('Technician password reset request failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// STAGE 3 — customer sets a new password
// ============================================

// Validate the reset token before showing the form.
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: request } = await supabase
      .from('password_resets')
      .select('id, email, status, reset_expires_at')
      .eq('reset_token', token)
      .maybeSingle();

    if (!request || request.status !== 'approved') {
      return res.status(404).json({ success: false, error: 'This reset link is not valid.' });
    }

    if (new Date(request.reset_expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This reset link has expired.' });
    }

    res.json({ success: true, data: { email: request.email } });
  } catch (error) {
    console.error('Reset token verification failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/confirm/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const { data: request } = await supabase
      .from('password_resets')
      .select('*')
      .eq('reset_token', token)
      .maybeSingle();

    if (!request || request.status !== 'approved') {
      return res.status(404).json({ success: false, error: 'This reset link is not valid.' });
    }

    if (new Date(request.reset_expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This reset link has expired.' });
    }

    const passwordHash = await hashPassword(password);

    // The row belongs to a customer, an admin or a technician; update whichever.
    const targetTable = request.admin_id ? 'admins'
      : request.technician_id ? 'technicians'
      : 'customers';
    const targetId = request.admin_id || request.technician_id || request.customer_id;

    const { error: updateOwnerError } = await supabase
      .from(targetTable)
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
      .eq('id', targetId);

    if (updateOwnerError) throw updateOwnerError;

    // Burn the token so the link cannot be reused.
    await supabase
      .from('password_resets')
      .update({
        status: 'completed',
        consumed_at: new Date().toISOString(),
        reset_token: null,
        reset_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', request.id);

    res.json({ success: true, message: 'Your password has been updated. You can now sign in.' });
  } catch (error) {
    console.error('Password reset confirmation failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
