// Web Push for technicians (ticket-assignment notifications). Browser-side
// half of services/pushNotificationService.js on the backend. Every export
// is best-effort and never throws into the caller's UI.
import { authFetch, authHeaders, API_BASE_URL } from '../services/adminApiService';

const SW_URL = `${import.meta.env.BASE_URL}sw.js`;
const SW_SCOPE = import.meta.env.BASE_URL;

export const isPushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const fetchPublicKey = async () => {
  const res = await authFetch(`${API_BASE_URL}/technician/push/public-key`, { headers: authHeaders() });
  const payload = await res.json().catch(() => null);
  return payload?.data?.publicKey || null;
};

const sendSubscription = async (subscription) => {
  const res = await authFetch(`${API_BASE_URL}/technician/push/subscribe`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ subscription: subscription.toJSON() })
  });
  if (!res.ok) throw new Error('Failed to save notification subscription');
};

const getOrCreateSubscription = async () => {
  const publicKey = await fetchPublicKey();
  if (!publicKey) return null; // push not configured on the server
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });
};

// 'enabled' | 'denied' | 'unsupported' | 'unavailable' | 'error'
// Must be called from a user gesture (a button click) — browsers block the
// permission prompt otherwise.
export const enableTechnicianPush = async () => {
  if (!isPushSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    const subscription = await getOrCreateSubscription();
    if (!subscription) return 'unavailable';
    await sendSubscription(subscription);
    return 'enabled';
  } catch (err) {
    console.warn('Enabling push notifications failed:', err);
    return 'error';
  }
};

// Permission was already granted earlier: silently make sure this browser's
// subscription is registered for the signed-in technician. Returns true when
// a subscription is active.
export const syncTechnicianPush = async () => {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  try {
    const subscription = await getOrCreateSubscription();
    if (!subscription) return false;
    await sendSubscription(subscription);
    return true;
  } catch (err) {
    console.warn('Syncing push subscription failed:', err);
    return false;
  }
};

// On logout: stop this browser receiving the technician's notifications.
// `accessToken` is captured by the caller before tokens are cleared. The
// local unsubscribe alone is enough — the server drops the stale row the
// next time the push service reports it gone.
export const disableTechnicianPushOnLogout = (accessToken) => {
  if (!isPushSupported()) return;
  (async () => {
    const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    if (accessToken) {
      fetch(`${API_BASE_URL}/technician/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      }).catch(() => {});
    }
    await subscription.unsubscribe();
  })().catch(() => {});
};
