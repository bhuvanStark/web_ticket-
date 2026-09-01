import express from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { verifyToken, hashPassword } from '../middleware/auth.js';
import {
  sendInviteEmail,
  buildInviteEmailHtml,
  sendTeamMemberRequestEmail
} from '../services/emailService.js';

const router = express.Router();

const INVITE_TOKEN_EXPIRY_HOURS = 72;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAppUrl(req) {
  return process.env.FRONTEND_URL || `${req.protocol}://${req.hostname}:3000`;
}

// GET /api/team-members - list team members for the logged-in customer
router.get('/', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('id, full_name, email, job_role, access_level, status, created_at, activated_at')
      .eq('customer_id', req.userId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/team-members/invite - a customer REQUESTS that TaskTel add an
// authorized user. Nothing is written to the database: this only emails the
// request to the TaskTel admin, who creates the account manually.
router.post('/invite', verifyToken, async (req, res) => {
  try {
    const { full_name, email, job_role } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({
        success: false,
        error: 'full_name and email are required'
      });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      return res.status(500).json({ success: false, error: 'ADMIN_EMAIL is not configured' });
    }

    const { data: requester } = await supabase
      .from('customers')
      .select('name, company_name')
      .eq('id', req.userId)
      .single();

    let emailResult = { sent: false };
    try {
      emailResult = await sendTeamMemberRequestEmail({
        adminEmail,
        companyName: requester?.company_name,
        requesterName: requester?.name,
        memberName: full_name,
        memberRole: job_role,
        memberEmail: email
      });
    } catch (emailError) {
      console.error('Failed to send team member request email:', emailError);
    }

    res.status(202).json({
      success: true,
      message: 'Your request has been sent to TaskTel. They will set up the account.',
      emailSent: emailResult.sent
    });
  } catch (error) {
    console.error('Error handling team member request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/team-members/:id/resend - resend an invitation
router.post('/:id/resend', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: member, error: fetchError } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', id)
      .eq('customer_id', req.userId)
      .single();

    if (fetchError || !member) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    if (member.status === 'active') {
      return res.status(400).json({ success: false, error: 'This member has already activated their account' });
    }

    const { data: inviter } = await supabase
      .from('customers')
      .select('name, company_name')
      .eq('id', req.userId)
      .single();

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from('team_members')
      .update({ invite_token: inviteToken, invite_token_expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) throw updateError;

    const activateUrl = `${getAppUrl(req)}/activate-account?token=${inviteToken}`;

    const emailResult = await sendInviteEmail({
      recipientEmail: member.email,
      recipientName: member.full_name,
      companyName: inviter?.company_name,
      jobRole: member.job_role,
      inviterName: inviter?.name,
      activateUrl
    });

    res.json({
      success: true,
      message: emailResult.sent ? 'Invitation resent successfully' : 'Invitation refreshed, but email could not be sent',
      emailSent: emailResult.sent
    });
  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/team-members/:id/email-preview - render the invitation email HTML (view-only, does not resend)
router.get('/:id/email-preview', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: member, error: fetchError } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', id)
      .eq('customer_id', req.userId)
      .single();

    if (fetchError || !member) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    const { data: inviter } = await supabase
      .from('customers')
      .select('name, company_name')
      .eq('id', req.userId)
      .single();

    const activateUrl = member.invite_token
      ? `${getAppUrl(req)}/activate-account?token=${member.invite_token}`
      : `${getAppUrl(req)}/activate-account`;

    const html = buildInviteEmailHtml({
      recipientName: member.full_name,
      companyName: inviter?.company_name,
      jobRole: member.job_role,
      inviterName: inviter?.name,
      activateUrl
    });

    res.json({ success: true, data: { html, email: member.email } });
  } catch (error) {
    console.error('Error building email preview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/team-members/:id - remove a team member
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('id', id)
      .eq('customer_id', req.userId)
      .single();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    const { error } = await supabase.from('team_members').delete().eq('id', id);
    if (error) throw error;

    res.json({ success: true, message: 'Team member removed successfully' });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/team-members/activate/:token - look up an invite by token (for the set-password screen)
router.get('/activate/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, full_name, email, job_role, status, invite_token_expires_at')
      .eq('invite_token', token)
      .single();

    if (error || !member) {
      return res.status(404).json({ success: false, error: 'Invalid or unknown invitation link' });
    }

    if (member.status === 'active') {
      return res.status(400).json({ success: false, error: 'This invitation has already been used' });
    }

    if (new Date(member.invite_token_expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This invitation link has expired' });
    }

    res.json({ success: true, data: { full_name: member.full_name, email: member.email, job_role: member.job_role } });
  } catch (error) {
    console.error('Error validating invite token:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/team-members/activate/:token - set password and activate the invited account
router.post('/activate/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const { data: member, error: fetchError } = await supabase
      .from('team_members')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (fetchError || !member) {
      return res.status(404).json({ success: false, error: 'Invalid or unknown invitation link' });
    }

    if (member.status === 'active') {
      return res.status(400).json({ success: false, error: 'This invitation has already been used' });
    }

    if (new Date(member.invite_token_expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This invitation link has expired' });
    }

    const passwordHash = await hashPassword(password);

    const { error: updateError } = await supabase
      .from('team_members')
      .update({
        password_hash: passwordHash,
        status: 'active',
        activated_at: new Date().toISOString(),
        invite_token: null,
        invite_token_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', member.id);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Account activated successfully' });
  } catch (error) {
    console.error('Error activating team member:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
