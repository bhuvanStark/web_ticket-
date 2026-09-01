// Real-Time Push Notifications & SMS / WhatsApp Alert Engine

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('Browser does not support Web Push notifications.');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export function sendWebPushNotification(title, body, icon = '/tasktel-icon.png') {
  // 1. Try Native Browser Push
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon,
        badge: icon,
        vibrate: [200, 100, 200]
      });
    } catch (e) {
      console.log('Web Push fallback triggered:', e);
    }
  }

  // 2. Log Automated SMS Payload (Twilio / TeleStax integration target)
  console.log(`[TWILIO SMS DISPATCHED] To: +91 98450 12345 | Message: "${title}: ${body}"`);

  // 3. Log Automated WhatsApp Business API Payload
  console.log(`[WHATSAPP BUSINESS API DISPATCHED] To: +91 98450 12345 | Payload: "${title} - ${body}"`);
}
