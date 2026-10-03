import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, PlusCircle, AlertCircle, Pencil } from 'lucide-react';
import { StateSelect } from '../common/StateSelect';

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
// 'Other' reveals a free-text input below the select for a custom room name.
const AV_ROOMS = [
  'Huddle Room',
  'Board Room',
  'Training Room',
  'Town Hall',
  'Other'
];

// transformDbTicketToAdmin fills missing values with display placeholders;
// those must not be pre-filled into the edit form as if they were real data.
const PLACEHOLDER_VALUES = ['Unknown customer', 'Unknown location', 'Unknown room', '—'];
const realValue = (value) => (value && !PLACEHOLDER_VALUES.includes(value) ? value : '');

// preferred_date is a DATE column; pg serialises it as an ISO timestamp at
// local midnight. Read it back as the local calendar date for <input type="date">.
const toDateInputValue = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// <input type="time"> only understands HH:MM. Customer-booked tickets store a
// slot label instead (e.g. "09:00 AM - 11:00 AM"), kept as-is unless replaced.
const isTimeInputValue = (value) => /^\d{2}:\d{2}/.test(value || '');

export const CreateTicketModal = () => {
  const {
    isCreateTicketOpen,
    setIsCreateTicketOpen,
    createServiceRequest,
    // Edit mode: set by the dashboard's Edit action; null in create mode.
    editingTicket,
    setEditingTicket,
    updateServiceRequest
  } = useApp();
  const isEditMode = !!editingTicket;
  const isOpen = isCreateTicketOpen || isEditMode;

  // Customer Organisation and Facility Location are plain text stored on this
  // ticket — no lookup, no matching, no profile creation.
  const [customerOrg, setCustomerOrg] = useState('');
  const [facilityLocation, setFacilityLocation] = useState('');
  const [roomName, setRoomName] = useState('');
  // Only used when roomName === 'Other' — the admin's typed custom room name.
  const [customRoomName, setCustomRoomName] = useState('');

  // Free text: Name - Phone - Email in one field. Stored verbatim, shown to the tech.
  const [contact, setContact] = useState('');

  const [title, setTitle] = useState('');
  // 'AV' | 'EPABX' — drives the issue-category list and whether a room is asked.
  const [serviceType, setServiceType] = useState('AV');
  const [issueType, setIssueType] = useState(AV_ISSUE_CATEGORIES[0]);
  const [area, setArea] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Clear a stale error banner whenever the popup is (re)opened.
  useEffect(() => {
    if (isCreateTicketOpen) setFormError('');
  }, [isCreateTicketOpen]);

  // Edit mode: pre-fill every field from the ticket being edited.
  useEffect(() => {
    if (!editingTicket) return;
    const t = editingTicket;
    const nextType = t.serviceType === 'EPABX' ? 'EPABX' : 'AV';
    const room = nextType === 'EPABX' ? '' : realValue(t.room);
    const isFixedRoom = AV_ROOMS.includes(room) && room !== 'Other';

    setFormError('');
    setCustomerOrg(realValue(t.customer));
    setFacilityLocation(realValue(t.location));
    setRoomName(room ? (isFixedRoom ? room : 'Other') : '');
    setCustomRoomName(room && !isFixedRoom ? room : '');
    setContact(t.contact || '');
    setTitle(t.title || '');
    setServiceType(nextType);
    setIssueType(t.issueType || (nextType === 'EPABX' ? EPABX_ISSUE_CATEGORIES : AV_ISSUE_CATEGORIES)[0]);
    setArea(t.area || '');
    setSelectedDate(toDateInputValue(t.preferredDate));
    setSelectedTime(t.preferredSlot || '');
  }, [editingTicket]);

  if (!isOpen) return null;

  // Leaving edit mode resets the form so the next "Create" starts blank.
  const closeModal = () => {
    if (isEditMode) {
      setEditingTicket(null);
      setCustomerOrg('');
      setFacilityLocation('');
      setRoomName('');
      setCustomRoomName('');
      setContact('');
      setTitle('');
      setServiceType('AV');
      setIssueType(AV_ISSUE_CATEGORIES[0]);
      setArea('');
      setSelectedDate('');
      setSelectedTime('');
      setFormError('');
    } else {
      setIsCreateTicketOpen(false);
    }
  };

  const isEpabx = serviceType === 'EPABX';
  const baseIssueCategories = isEpabx ? EPABX_ISSUE_CATEGORIES : AV_ISSUE_CATEGORIES;
  // Keep a ticket's existing category selectable in edit mode even if it is
  // not in the current list, so saving never silently changes it.
  const issueCategories = issueType && !baseIssueCategories.includes(issueType)
    ? [...baseIssueCategories, issueType]
    : baseIssueCategories;

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (submitting) return;

    if (!title.trim()) return;
    if (!customerOrg.trim() || !facilityLocation.trim()) {
      alert('Enter the customer organisation and select the facility location (state).');
      return;
    }
    if (!isEpabx && !roomName) {
      alert('Select a room for this AV ticket.');
      return;
    }
    if (!isEpabx && roomName === 'Other' && !customRoomName.trim()) {
      alert('Enter a custom room name for this AV ticket.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const ticketData = {
        title,
        customerOrg: customerOrg.trim(),
        facilityLocation: facilityLocation.trim(),
        // EPABX tickets carry no room; AV tickets require the selected one
        // (or the typed custom name when "Other" was picked).
        roomName: isEpabx ? null : (roomName === 'Other' ? customRoomName.trim() : roomName),
        contact: contact.trim() || null,
        serviceType,
        issueType,
        area: area.trim() || null,
        // Sent as separate columns; the modal already keeps them split.
        preferredDate: selectedDate || null,
        preferredTime: selectedTime || null,
        attachments: []
      };
      // Wait for the database write to actually succeed before closing.
      if (isEditMode) {
        await updateServiceRequest(editingTicket.dbId, ticketData);
      } else {
        await createServiceRequest(ticketData);
      }
      // Success: the context call already showed the success toast.
      closeModal();
    } catch (err) {
      // Failure: keep the popup open with everything the admin typed, show why.
      setFormError(err?.message || (isEditMode
        ? 'Could not update the ticket. Please try again.'
        : 'Could not create the ticket. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-[#E4E7EC] overflow-hidden my-8">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#004898] text-white flex items-center justify-center">
              {isEditMode ? <Pencil className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#172033]">
                {isEditMode ? `Edit Service Request ${editingTicket.id}` : 'Create Service Request'}
              </h3>
              <p className="text-xs text-[#667085]">
                {isEditMode ? 'Update the details of this support ticket' : 'Log a new support ticket into the operational system'}
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            disabled={submitting}
            className="p-1 text-[#667085] hover:text-[#172033] rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {formError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318]">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs font-semibold">{formError}</p>
            </div>
          )}

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
                <label className="block text-xs font-bold text-[#172033] mb-1">Facility Location <span className="font-normal text-[#98A2B3]">(state)</span></label>
                <StateSelect
                  value={facilityLocation}
                  onChange={setFacilityLocation}
                  placeholder="Select a state…"
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
                  {roomName === 'Other' && (
                    <input
                      type="text"
                      value={customRoomName}
                      onChange={(e) => setCustomRoomName(e.target.value)}
                      placeholder="Enter the room name"
                      className="w-full mt-2 px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
                    />
                  )}
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

              <div className={isEpabx ? 'sm:col-span-2' : 'sm:col-span-3'}>
                <label className="block text-xs font-bold text-[#172033] mb-1">Contact <span className="font-normal text-[#98A2B3]">(optional — Name - Phone - Email)</span></label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="e.g. Ramesh Kumar - 9876543210 - ramesh@abc.com"
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
                  value={isTimeInputValue(selectedTime) ? selectedTime : ''}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full px-2 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
                />
                {selectedTime && !isTimeInputValue(selectedTime) && (
                  <p className="text-[11px] text-[#667085] mt-1">
                    Current slot: <span className="font-semibold text-[#172033]">{selectedTime}</span> — pick a time to replace it.
                  </p>
                )}
              </div>
            </div>
          </div>

        </form>

        {/* Footer Actions */}
        <div className="p-5 border-t border-[#E4E7EC] bg-[#FAFCFF] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={closeModal}
            disabled={submitting}
            className="px-4 py-2.5 text-xs font-bold text-[#475467] hover:text-[#172033] hover:bg-[#F2F4F7] rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2.5 bg-[#004898] hover:bg-[#003673] text-white font-extrabold text-xs rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isEditMode
              ? (submitting ? 'Saving…' : 'Save Changes')
              : (submitting ? 'Creating…' : 'Create Service Ticket')}
          </button>
        </div>
      </div>
    </div>
  );
};
