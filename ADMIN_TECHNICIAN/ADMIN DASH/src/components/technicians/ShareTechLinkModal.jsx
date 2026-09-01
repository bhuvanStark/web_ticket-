import React, { useState } from 'react';
import { X, Link2, Copy, CheckCircle, Mail, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function ShareTechLinkModal({ tech, onClose }) {
  const { showToast } = useApp();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  if (!tech) return null;

  const baseUrl = 'https://portal.tasktel-av.com';
  const directLink = `${baseUrl}/tech-access?id=${tech.id || tech.name.replace(/\s+/g, '')}`;

  const messageInvite = `Hi ${tech.name},

Welcome to TaskTel AV Field Operations Portal!
Access your active service jobs, room blueprints, and preventative maintenance schedules here:

👉 Direct Portal Access Link: ${directLink}

Registered Email: ${tech.email || 'tech@tasktel-av.com'}
Assigned Region: ${tech.location || 'Bengaluru Campus'}
Default Access PIN: 4321`;

  const copyToClipboard = (text, isInvite = false) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); } catch (err) {}
      document.body.removeChild(textArea);
    }
    if (isInvite) {
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
      showToast(`Full invite message for ${tech.name} copied to clipboard!`, 'success');
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      showToast(`Direct access link for ${tech.name} copied!`, 'success');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src={tech.avatar} 
              alt={tech.name} 
              className="w-10 h-10 rounded-full object-cover border-2 border-[#004898]" 
            />
            <div>
              <span className="text-[10px] font-extrabold text-[#667085] uppercase tracking-wider">Access Credentials</span>
              <h3 className="font-extrabold text-base text-[#172033]">Share Login & Access Credentials</h3>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Direct Link Input */}
          <div>
            <label className="form-label mb-1.5 flex items-center justify-between">
              <span>Direct Access Link for {tech.name}</span>
              <span className="text-[11px] text-[#12B76A] font-bold">Auto-Logins to Tech Portal</span>
            </label>

            <div className="flex items-stretch gap-2">
              <div className="flex-1 bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E4E7EC] font-mono text-[#004898] text-[11px] truncate flex items-center">
                {directLink}
              </div>

              <button
                onClick={() => copyToClipboard(directLink, false)}
                className="btn btn-primary text-xs font-bold whitespace-nowrap px-4 rounded-lg"
              >
                {copiedLink ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* Full Invitation Message Box */}
          <div>
            <label className="form-label mb-1.5">WhatsApp / Email Invitation Template</label>
            <textarea
              rows={6}
              readOnly
              value={messageInvite}
              className="w-full p-3 text-[11px] font-mono bg-[#F8FAFC] text-[#334155] border border-[#E4E7EC] rounded-lg focus:outline-none resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-between gap-3">
            <button
              onClick={() => copyToClipboard(messageInvite, true)}
              className="btn btn-secondary text-xs font-bold flex-1 py-2 rounded-lg"
            >
              {copiedInvite ? <CheckCircle className="w-4 h-4 text-[#12B76A]" /> : <MessageSquare className="w-4 h-4 text-[#475467]" />}
              <span>{copiedInvite ? 'Invite Copied!' : 'Copy WhatsApp / Email Invite'}</span>
            </button>

            <button
              onClick={onClose}
              className="btn btn-primary text-xs font-bold py-2 px-6 rounded-lg"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
