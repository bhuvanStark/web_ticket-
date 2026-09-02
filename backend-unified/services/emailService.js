import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_PASS || '').trim().replace(/\s+/g, '');
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;

  if (!user || !pass) {
    console.warn('⚠️  SMTP_USER/SMTP_PASS not configured — invitation emails will be logged, not sent.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    // Railway resolves smtp.gmail.com to IPv6 and fails with ENETUNREACH —
    // pin the SMTP connection to IPv4 and fail fast instead of hanging.
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });

  return transporter;
}

export function buildInviteEmailHtml({ recipientName, companyName, jobRole, inviterName, activateUrl }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #172033; }
        .container { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e4e7ec; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #004898 0%, #002d62 100%); color: #ffffff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 800; }
        .content { padding: 28px 24px; }
        .welcome { font-size: 16px; font-weight: 700; color: #004898; margin-bottom: 12px; }
        .badge { display: inline-block; background: #eff5fc; color: #004898; border: 1px solid #b3d1f2; font-weight: 800; padding: 4px 10px; border-radius: 12px; font-size: 12px; margin-bottom: 16px; }
        .button-box { text-align: center; margin: 24px 0; }
        .btn { display: inline-block; background-color: #004898; color: #ffffff !important; padding: 14px 28px; font-weight: 800; font-size: 14px; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,72,152,0.3); }
        .footer { background: #f8fafc; padding: 16px; border-top: 1px solid #e4e7ec; font-size: 11px; color: #667085; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>TaskTel Enterprise AV Portal</h1>
          <div style="font-size: 12px; opacity: 0.85; margin-top: 4px;">Official Shared Account Invitation</div>
        </div>
        <div class="content">
          <div class="welcome">You've been invited to join ${companyName || 'your team'}!</div>
          <div class="badge">Role: ${jobRole || 'Authorized User'}</div>
          <p>Hello <strong>${recipientName || 'there'}</strong>,</p>
          <p><strong>${inviterName || 'Your administrator'}</strong> has granted you access to the <strong>${companyName || 'company'}</strong> shared support portal on TaskTel AV.</p>
          <p style="font-size: 13px; color: #475467;">No plain-text password was set for your security. Click the button below to set your password and complete account setup:</p>
          <div class="button-box">
            <a href="${activateUrl}" class="btn" target="_blank">Set Password &amp; Activate Account</a>
          </div>
          <p style="font-size: 12px; color: #98a2b3;">This secure activation link expires in 72 hours. If you have questions, contact your IT administrator.</p>
        </div>
        <div class="footer">
          &copy; 2026 TaskTel Enterprise AV Desk. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
}

export const sendInviteEmail = async ({ recipientEmail, recipientName, companyName, jobRole, inviterName, activateUrl }) => {
  const html = buildInviteEmailHtml({ recipientName, companyName, jobRole, inviterName, activateUrl });
  const activeTransporter = getTransporter();

  if (!activeTransporter) {
    console.log(`[email:stub] Invite for ${recipientEmail} — activate URL: ${activateUrl}`);
    return { sent: false, previewUrl: null };
  }

  const sender = process.env.SMTP_USER || process.env.GMAIL_USER;
  const info = await activeTransporter.sendMail({
    from: `"TaskTel Enterprise AV Desk" <${sender}>`,
    to: recipientEmail,
    subject: `[${companyName || 'TaskTel'}] You've been invited to join TaskTel AV`,
    html
  });

  return { sent: true, messageId: info.messageId };
};

// Shared shell so all TaskTel emails look the same.
function wrapEmail({ heading, bodyHtml }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #172033; }
        .container { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e4e7ec; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #004898 0%, #002d62 100%); color: #ffffff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 800; }
        .content { padding: 28px 24px; }
        .button-box { text-align: center; margin: 24px 0; }
        .btn { display: inline-block; background-color: #004898; color: #ffffff !important; padding: 14px 28px; font-weight: 800; font-size: 14px; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,72,152,0.3); }
        .meta { background: #f8fafc; border: 1px solid #e4e7ec; border-radius: 8px; padding: 12px 14px; font-size: 13px; margin: 16px 0; }
        .meta div { margin: 3px 0; }
        .footer { background: #f8fafc; padding: 16px; border-top: 1px solid #e4e7ec; font-size: 11px; color: #667085; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>TaskTel Enterprise AV Portal</h1>
          <div style="font-size: 12px; opacity: 0.85; margin-top: 4px;">${heading}</div>
        </div>
        <div class="content">${bodyHtml}</div>
        <div class="footer">&copy; 2026 TaskTel Enterprise AV Desk. All rights reserved.</div>
      </div>
    </body>
    </html>
  `;
}

// Stage 1: tell the administrator that somebody asked for a password reset.
export function buildResetApprovalEmailHtml({ customerName, customerEmail, companyName, requestedAt, approveUrl }) {
  return wrapEmail({
    heading: 'Password Reset Approval Required',
    bodyHtml: `
      <div style="font-size: 16px; font-weight: 700; color: #004898; margin-bottom: 12px;">A password reset was requested</div>
      <p style="font-size: 13px; color: #475467;">The account below asked to reset its TaskTel password. Approve the request to email a secure reset link to the account holder.</p>
      <div class="meta">
        <div><strong>Name:</strong> ${customerName || '—'}</div>
        <div><strong>Email:</strong> ${customerEmail}</div>
        <div><strong>Company:</strong> ${companyName || '—'}</div>
        <div><strong>Requested:</strong> ${requestedAt}</div>
      </div>
      <div class="button-box">
        <a href="${approveUrl}" class="btn" target="_blank">Approve &amp; Send Reset Link</a>
      </div>
      <p style="font-size: 12px; color: #98a2b3;">This approval link expires in 24 hours. If you do not recognise this request, simply ignore this email — no reset link will be sent.</p>
    `
  });
}

// Customer OTP: a 4-digit code emailed straight to the account holder, no
// admin approval. Entered in the app to unlock the "set new password" step.
export function buildResetOtpEmailHtml({ customerName, otp }) {
  return wrapEmail({
    heading: 'Password Reset Code',
    bodyHtml: `
      <div style="font-size: 16px; font-weight: 700; color: #004898; margin-bottom: 12px;">Your password reset code</div>
      <p>Hello <strong>${customerName || 'there'}</strong>,</p>
      <p style="font-size: 13px; color: #475467;">Enter this code in the TaskTel app to reset your password:</p>
      <div style="text-align: center; margin: 24px 0;">
        <div style="display: inline-block; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #172033; background: #f8fafc; border: 1px solid #e4e7ec; border-radius: 10px; padding: 14px 24px;">${otp}</div>
      </div>
      <p style="font-size: 12px; color: #98a2b3;">This code expires in 10 minutes and can be used once. If you did not request this, you can safely ignore this email.</p>
    `
  });
}

// Customer portal sign-in code. The customer portal has no password — a correct
// code proves control of the account email and signs the user straight in.
export function buildLoginOtpEmailHtml({ customerName, otp }) {
  return wrapEmail({
    heading: 'Your Sign-In Code',
    bodyHtml: `
      <div style="font-size: 16px; font-weight: 700; color: #004898; margin-bottom: 12px;">Your sign-in code</div>
      <p>Hello <strong>${customerName || 'there'}</strong>,</p>
      <p style="font-size: 13px; color: #475467;">Enter this code in the TaskTel app to sign in:</p>
      <div style="text-align: center; margin: 24px 0;">
        <div style="display: inline-block; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #172033; background: #f8fafc; border: 1px solid #e4e7ec; border-radius: 10px; padding: 14px 24px;">${otp}</div>
      </div>
      <p style="font-size: 12px; color: #98a2b3;">This code expires in 5 minutes and can be used once. If you did not try to sign in, you can safely ignore this email.</p>
    `
  });
}

// Stage 2: the reset link that actually goes to the customer.
export function buildResetLinkEmailHtml({ customerName, resetUrl }) {
  return wrapEmail({
    heading: 'Password Reset Approved',
    bodyHtml: `
      <div style="font-size: 16px; font-weight: 700; color: #004898; margin-bottom: 12px;">Set your new password</div>
      <p>Hello <strong>${customerName || 'there'}</strong>,</p>
      <p style="font-size: 13px; color: #475467;">Your password reset request has been approved by your administrator. Click the button below to choose a new password.</p>
      <div class="button-box">
        <a href="${resetUrl}" class="btn" target="_blank">Reset My Password</a>
      </div>
      <p style="font-size: 12px; color: #98a2b3;">This link expires in 1 hour and can be used once. If you did not request this, contact your administrator.</p>
    `
  });
}

const sendMail = async ({ to, subject, html, logLabel, logUrl }) => {
  const activeTransporter = getTransporter();

  if (!activeTransporter) {
    console.log(`[email:stub] ${logLabel} for ${to} — URL: ${logUrl}`);
    return { sent: false };
  }

  const sender = process.env.SMTP_USER || process.env.GMAIL_USER;
  const info = await activeTransporter.sendMail({
    from: `"TaskTel Enterprise AV Desk" <${sender}>`,
    to,
    subject,
    html
  });

  return { sent: true, messageId: info.messageId };
};

export const sendResetApprovalEmail = async ({ adminEmail, customerName, customerEmail, companyName, requestedAt, approveUrl }) =>
  sendMail({
    to: adminEmail,
    subject: `[TaskTel] Password reset approval required — ${customerEmail}`,
    html: buildResetApprovalEmailHtml({ customerName, customerEmail, companyName, requestedAt, approveUrl }),
    logLabel: 'Reset approval',
    logUrl: approveUrl
  });

export const sendResetLinkEmail = async ({ customerEmail, customerName, resetUrl }) =>
  sendMail({
    to: customerEmail,
    subject: '[TaskTel] Reset your password',
    html: buildResetLinkEmailHtml({ customerName, resetUrl }),
    logLabel: 'Reset link',
    logUrl: resetUrl
  });

export const sendResetOtpEmail = async ({ customerEmail, customerName, otp }) =>
  sendMail({
    to: customerEmail,
    subject: '[TaskTel] Your password reset code',
    html: buildResetOtpEmailHtml({ customerName, otp }),
    logLabel: 'Reset OTP',
    logUrl: `code: ${otp}`
  });

export const sendLoginOtpEmail = async ({ customerEmail, customerName, otp }) =>
  sendMail({
    to: customerEmail,
    subject: '[TaskTel] Your sign-in code',
    html: buildLoginOtpEmailHtml({ customerName, otp }),
    logLabel: 'Login OTP',
    logUrl: `code: ${otp}`
  });

// A customer asked TaskTel to add an authorized user to their company account.
// Nothing is written to the database — this email is the whole request. TaskTel
// then creates the account manually from the admin dashboard.
export function buildTeamMemberRequestEmailHtml({ companyName, requesterName, memberName, memberRole, memberEmail }) {
  return wrapEmail({
    heading: 'New Authorized-User Request',
    bodyHtml: `
      <div style="font-size: 16px; font-weight: 700; color: #004898; margin-bottom: 12px;">A client asked to add a team member</div>
      <p style="font-size: 13px; color: #475467;">
        <strong>${requesterName || 'A client'}</strong> from <strong>${companyName || 'a company'}</strong>
        has requested an authorized user be added to their TaskTel account. Add this contact from
        <strong>Customers &rarr; Add Customer</strong> in the admin dashboard.
      </p>
      <div class="meta">
        <div><strong>Company:</strong> ${companyName || '—'}</div>
        <div><strong>Requested by:</strong> ${requesterName || '—'}</div>
        <div><strong>Member name:</strong> ${memberName || '—'}</div>
        <div><strong>Member role:</strong> ${memberRole || '—'}</div>
        <div><strong>Member email:</strong> ${memberEmail}</div>
      </div>
      <p style="font-size: 12px; color: #98a2b3;">
        No account has been created. Review the details and add the user yourself if approved.
      </p>
    `
  });
}

export const sendTeamMemberRequestEmail = async ({ adminEmail, companyName, requesterName, memberName, memberRole, memberEmail }) =>
  sendMail({
    to: adminEmail,
    subject: `[TaskTel] Authorized-user request — ${companyName || 'client'} (${memberEmail})`,
    html: buildTeamMemberRequestEmailHtml({ companyName, requesterName, memberName, memberRole, memberEmail }),
    logLabel: 'Team member request',
    logUrl: `member: ${memberName} <${memberEmail}>`
  });

export default {
  sendInviteEmail,
  buildInviteEmailHtml,
  sendResetApprovalEmail,
  sendResetLinkEmail,
  sendResetOtpEmail,
  sendLoginOtpEmail,
  sendTeamMemberRequestEmail
};
