import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, PlusCircle } from 'lucide-react';

// Issue categories per support line — kept in sync with the customer app's
// BookServiceWizard so an admin-raised ticket is categorised identically.
const AV_ISSUE_CATEGORIES = [
  'Display',
  'Audio',
  'Room automation',
  'Cables',
  'Camera',
  'Native platform issue',
  'VC Bar',
  'Other'
];

const EPABX_ISSUE_CATEGORIES = [
  'Extension',
  'System Down',
  'Programming Change',
  'Incoming/Outgoing',
  'Other'
];

// Fixed AV room choices for this form — not tied to any location or customer.
const AV_ROOMS = [
  'Huddle Room',
  'Board Room',
  'Training Room',
  'Town Hall'
];

export const CreateTicketModal = () => {
  const {
    isCreateTicketOpen,
    setIsCreateTicketOpen,
    createServiceRequest
  } = useApp();

  // Customer Organisation and Facility Location are plain text stored on this
  // ticket — no lookup, no matching, no profile creation.
  const [customerOrg, setCustomerOrg] = useState('');
  const [facilityLocation, setFacilityLocation] = useState('');
  const [roomName, setRoomName] = useState('');

  const [title, setTitle] = useState('');
  // 'AV' | 'EPABX' — drives the issue-category list and whether a room is asked.
  const [serviceType, setServiceType] = useState('AV');
  const [issueType, setIssueType] = useState(AV_ISSUE_CATEGORIES[0]);
  const [area, setArea] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  if (!isCreateTicketOpen) return null;

  const isEpabx = serviceType === 'EPABX';
  const issueCategories = isEpabx ? EPABX_ISSUE_CATEGORIES : AV_ISSUE_CATEGORIES;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!customerOrg.trim() || !facilityLocation.trim()) {
      alert('Enter the customer organisation and facility location.');
      return;
    }
    if (!isEpabx && !roomName) {
      alert('Select a room for this AV ticket.');
      return;
    }

    createServiceRequest({
      title,
      customerOrg: customerOrg.trim(),
      facilityLocation: facilityLocation.trim(),
      // EPABX tickets carry no room; AV tickets require the selected one.
      roomName: isEpabx ? null : roomName,
      serviceType,
      issueType,
      area: area.trim() || null,
      // Sent as separate columns; the modal already keeps them split.
      preferredDate: selectedDate || null,
      preferredTime: selectedTime || null,
      attachments: []
    });

    setIsCreateTicketOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-[#E4E7EC] overflow-hidden my-8">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#004898] text-white flex items-center justify-center">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#172033]">Create Service Request</h3>
              <p className="text-xs text-[#667085]">Log a new support ticket into the operational system</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateTicketOpen(false)}
            className="p-1 text-[#667085] hover:text-[#172033] rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Customer / Location / Room cascade — Room only for AV */}
          <div className="p-4 rounded-xl border border-[#E4E7EC] space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#004898]">
              1. {isEpabx ? 'Customer & Location' : 'Target Asset & Location Hierarchy'}
            </h4>

            <div className={`grid grid-cols-1 gap-3 ${isEpabx ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              <div>
                <label className="block text-xs font-bold text-[#172033] mb-1">Customer Organization</label>
                <input
                  type="text"
                  value={customerOrg}
                  onChange={(e) => setCustomerOrg(e.target.value)}
                  placeholder="e.g. ABC Private Limited"
                  className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#004898] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172033] mb-1">Facility Location</label>
                <input
                  type="text"
                  value={facilityLocation}
                  onChange={(e) => setFacilityLocation(e.target.value)}
                  placeholder="e.g. Chennai Office - 2nd Floor"
                  className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none"
                />
              </div>

              {!isEpabx && (
                <div>
                  <label className="block text-xs font-bold text-[#172033] mb-1">Room</label>
                  <select
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none"
                  >
                    <option value="" disabled>Select a room</option>
                    {AV_ROOMS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className={isEpabx ? 'sm:col-span-2' : 'sm:col-span-3'}>
                <label className="block text-xs font-bold text-[#172033] mb-1">Area <span className="font-normal text-[#98A2B3]">(optional)</span></label>
                <input
                  type="text"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. 3rd Floor East Wing, Reception"
                  className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
                />
              </div>
            </div>
          </div>

          {/* Issue Information */}
          <div className="p-4 rounded-xl border border-[#E4E7EC] space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#004898]">
              2. Issue Information
            </h4>

            <div>
              <label className="block text-xs font-bold text-[#172033] mb-1">Ticket Title / Short Description *</label>
              <input
                type="text"
                required
                placeholder={isEpabx ? 'e.g., Extension 204 not receiving external calls' : 'e.g., Wireless touch panel unresponsive during conference'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm outline-none focus:border-[#004898]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-xs font-bold text-[#172033] mb-1">Service Type</label>
                <select
                  value={serviceType}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    setServiceType(nextType);
                    // Keep the category valid for the newly chosen support line.
                    const nextCats = nextType === 'EPABX' ? EPABX_ISSUE_CATEGORIES : AV_ISSUE_CATEGORIES;
                    setIssueType(nextCats[0]);
                  }}
                  className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm font-semibold outline-none focus:border-[#004898]"
                >
                  <option value="AV">AV Support</option>
                  <option value="EPABX">EPABX / Telephony</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172033] mb-1">Issue Category</label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm outline-none focus:border-[#004898]"
                >
                  {issueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172033] mb-1">Preferred Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-2 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172033] mb-1">Preferred Time</label>
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full px-2 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
                />
              </div>
            </div>
          </div>

        </form>

        {/* Footer Actions */}
        <div className="p-5 border-t border-[#E4E7EC] bg-[#FAFCFF] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsCreateTicketOpen(false)}
            className="px-4 py-2.5 text-xs font-bold text-[#475467] hover:text-[#172033] hover:bg-[#F2F4F7] rounded-lg transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-[#004898] hover:bg-[#003673] text-white font-extrabold text-xs rounded-lg transition-all shadow-xs cursor-pointer"
          >
            Create Service Ticket
          </button>
        </div>
      </div>
    </div>
  );
};
