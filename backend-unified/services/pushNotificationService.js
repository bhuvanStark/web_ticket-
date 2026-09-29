// Web Push for technicians — notifies a technician's subscribed devices when
// a service ticket is assigned to them, with an email fallback when no push
// could be delivered. Called fire-and-forget from the assignment routes in
// routes/serviceRequests.js: nothing here can fail or delay an assignment.
//
// Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT. Without them
// push is simply disabled and every assignment goes straight to the email
// fallback.
import webpush from 'web-push';
import { supabase } from '../config/supabaseClient.js';
import { query } from '../config/database.js';
import { sendTicketAssignedEmail } from './emailService.js';

let vapidConfigured = null;

export const getVapidPublicKey = () => (process.env.VAPID_PUBLIC_KEY || '').trim() || null;

const ensureVapid = () => {
  if (vapidConfigured !== null) return vapidConfigured;
  const publicKey = getVapidPublicKey();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || '').trim() || `mailto:${process.env.ADMIN_EMAIL || 'admin@example.com'}`;
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys not configured — Web Push disabled, using email fallback only.');
    vapidConfigured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  } catch (error) {
    console.error('[push] Invalid VAPID configuration — Web Push disabled:', error.message);
    vapidConfigured = false;
  }
  return vapidConfigured;
};

// Upsert by endpoint: re-subscribing the same browser (or a different
// technician logging in on it) just re-points the one row.
export const saveSubscription = async (technicianId, subscription, userAgent) => {
  await query(
    `INSERT INTO technician_push_subscriptions (technician_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET technician_id = EXCLUDED.technician_id, p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
    [technicianId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent || null]
  );
};

export const removeSubscription = async (technicianId, endpoint) => {
  const { error } = await supabase
    .from('technician_push_subscriptions')
    .delete()
    .eq('technician_id', technicianId)
    .eq('endpoint', endpoint);
  if (error) throw new Error(`Failed to remove push subscription: ${error.message}`);
};

// Returns how many of the technician's devices accepted the push. Expired
// subscriptions (404/410 from the push service) are deleted along the way.
export const sendPushToTechnician = async (technicianId, payload) => {
  if (!ensureVapid()) return 0;
  const { data: subscriptions, error } = await supabase
    .from('technician_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('technician_id', technicianId);
  if (error) throw new Error(`Failed to load push subscriptions: ${error.message}`);

  const body = JSON.stringify(payload);
  let delivered = 0;
  for (const sub of subscriptions || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 60 * 60 * 24, urgency: 'high' }
      );
      delivered += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('technician_push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.warn(`[push] Delivery to technician ${technicianId} failed:`, err.statusCode || '', err.message);
      }
    }
  }
  return delivered;
};

const adminAppUrl = () => process.env.ADMIN_APP_URL || 'http://localhost:5173';

// `ticket` is the service_requests row as returned by the assign routes.
// `assignmentRole` is 'primary' or 'additional'. Never throws.
export const notifyTechnicianOfAssignment = async (technicianId, ticket, { assignmentRole = 'primary' } = {}) => {
  try {
    const { data: technician } = await supabase
      .from('technicians')
      .select('id, full_name, email')
      .eq('id', technicianId)
      .maybeSingle();

    const ticketNumber = ticket?.ticket_number || '';
    const issueTitle = ticket?.issue_title || ticket?.issue_category || 'Service ticket';
    const siteLabel = [ticket?.customer_org, ticket?.facility_location || ticket?.area].filter(Boolean).join(' · ');
    const modeLabel = ticket?.service_type === 'remote_support' ? 'Remote' : 'On-site';
    const roleLabel = assignmentRole === 'additional' ? 'additional technician' : 'ticket';

    let delivered = 0;
    try {
      delivered = await sendPushToTechnician(technicianId, {
        title: assignmentRole === 'additional' ? `Added to ticket ${ticketNumber}` : `New ticket ${ticketNumber}`,
        body: [issueTitle, siteLabel, modeLabel].filter(Boolean).join(' · '),
        tag: `ticket-${ticket?.id || ticketNumber}`,
        ticketId: ticket?.id || null
      });
    } catch (pushError) {
      console.warn('[push] Push lookup failed, falling back to email:', pushError.message);
    }

    if (delivered > 0 || !technician?.email) return;
    await sendTicketAssignedEmail({
      technicianEmail: technician.email,
      technicianName: technician.full_name,
      ticketNumber,
      issueTitle,
      siteLabel,
      modeLabel,
      roleLabel,
      appUrl: adminAppUrl()
    });
  } catch (error) {
    console.warn(`[push] Assignment notification for technician ${technicianId} failed:`, error.message);
  }
};
