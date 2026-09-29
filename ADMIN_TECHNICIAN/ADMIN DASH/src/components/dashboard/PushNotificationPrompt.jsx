// Opt-in for Web Push ticket-assignment notifications, shown on a real
// technician's dashboard only. Hidden when the browser can't do push, when
// the technician already enabled it, or after they blocked it (email is the
// fallback in every one of those cases, handled server-side).
import React, { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { isPushSupported, enableTechnicianPush, syncTechnicianPush } from '../../utils/webPush';

export const PushNotificationPrompt = () => {
  const [state, setState] = useState(() => {
    if (!isPushSupported()) return 'hidden';
    return Notification.permission === 'default' ? 'prompt' : 'hidden';
  });
  const [isWorking, setIsWorking] = useState(false);

  // Already granted on this browser: re-register silently (covers a new
  // technician logging in on the same device, or a server-side cleanup).
  useEffect(() => {
    if (isPushSupported() && Notification.permission === 'granted') syncTechnicianPush();
  }, []);

  if (state === 'hidden') return null;

  const handleEnable = async () => {
    setIsWorking(true);
    const result = await enableTechnicianPush();
    setIsWorking(false);
    setState(result === 'error' ? 'error' : 'hidden');
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E4E7EC] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-[#EFF5FC] text-[#004898]">
          <BellRing className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-extrabold text-[#172033]">Get notified when a ticket is assigned to you</p>
          <p className="text-xs text-[#667085] mt-0.5">
            {state === 'error' ? "Couldn't enable notifications on this device. You'll still get assignments by email." : 'Turn on browser notifications for this device.'}
          </p>
        </div>
      </div>
      <button
        onClick={handleEnable}
        disabled={isWorking}
        className="bg-[#004898] hover:bg-[#00346E] text-white rounded-xl px-5 py-2.5 text-xs font-extrabold transition-all disabled:opacity-60 cursor-pointer shrink-0"
      >
        {isWorking ? 'Enabling…' : state === 'error' ? 'Try again' : 'Enable notifications'}
      </button>
    </div>
  );
};
