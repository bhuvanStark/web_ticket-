import { useState } from 'react';
import {
  MapPin, CheckCircle, ChevronRight, ChevronLeft, ArrowLeft, Calendar, X, Zap
} from 'lucide-react';
// Media/photo upload is disabled for now — there is no matching field on the
// admin ticket and no backing column. Kept imported-out for a future revisit.
// import { CameraCaptureModal } from '../components/CameraCaptureModal';

// Issue categories differ by support line. Kept in sync with the admin
// CreateTicketModal so an admin-raised ticket is categorised identically.
// 'Other' is always last — a general catch-all that still writes a real row.
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

// Convert the calendar picker's { day, month: 'August', year } shape to the
// YYYY-MM-DD string the service_requests.preferred_date column expects.
const toIsoDate = (picked) => {
  if (!picked?.day || !picked?.month || !picked?.year) return null;
  const monthIndex = new Date(`${picked.month} 1, ${picked.year}`).getMonth();
  if (Number.isNaN(monthIndex)) return null;
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(picked.day).padStart(2, '0');
  return `${picked.year}-${mm}-${dd}`;
};

export function BookServiceWizard({
  initialRoomId = null,
  serviceType = 'AV',
  onComplete,
  onCancel,
  locations = [],
  rooms = []
}) {
  // Which support line this ticket is for. Drives the whole form: EPABX has no
  // room, and a different set of issue categories.
  const isEpabx = serviceType === 'EPABX';
  const issueCategories = isEpabx ? EPABX_ISSUE_CATEGORIES : AV_ISSUE_CATEGORIES;

  const initialRoomObj = (!isEpabx && initialRoomId) ? rooms.find(r => r.id === initialRoomId) : null;
  const initialLocObj = initialRoomObj ? locations.find(l => l.id === initialRoomObj.location_id) : null;

  // 3-Step Wizard
  const [step, setStep] = useState(initialRoomObj ? 2 : 1);
  const [selectedLocation, setSelectedLocation] = useState(initialLocObj || null);
  const [selectedRoom, setSelectedRoom] = useState(initialRoomObj || null);
  const [selectedCategory, setSelectedCategory] = useState('');
  // "Other" location — a free-typed place the customer's account does not have
  // yet. EPABX only (an AV ticket needs a configured room). The backend creates
  // the location on submit.
  const [otherLocation, setOtherLocation] = useState(false);
  const [otherLocationName, setOtherLocationName] = useState('');
  // Free-typed sub-locality within the site (e.g. "3rd Floor East Wing").
  const [area, setArea] = useState('');

  const [description, setDescription] = useState('');
  const [supportMode] = useState('On-site Service');
  const [urgency, setUrgency] = useState('asap');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [modalStep, setModalStep] = useState('date');
  const [selectedTime, setSelectedTime] = useState(null);

  const todayDate = new Date();

  // The visible month, so the user can browse forward instead of being locked
  // to the current one.
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());

  const currentMonthName = new Date(viewYear, viewMonth, 1)
    .toLocaleString('default', { month: 'long' });
  const currentYear = viewYear;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  // Only the real today counts as "today"; past days apply to this month only.
  const isCurrentMonth =
    viewMonth === todayDate.getMonth() && viewYear === todayDate.getFullYear();
  const todayDay = isCurrentMonth ? todayDate.getDate() : -1;
  const isPastMonth =
    viewYear < todayDate.getFullYear() ||
    (viewYear === todayDate.getFullYear() && viewMonth < todayDate.getMonth());

  const goToMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewMonth(next.getMonth());
    setViewYear(next.getFullYear());
  };

  const calendarDays = [];
  for (let i = 0; i < startOffset; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const availableRooms = selectedLocation ? rooms.filter(r => r.location_id === selectedLocation.id) : rooms;

  const usingOtherLocation = isEpabx && otherLocation;
  const canProceedStep1 = isEpabx
    ? (usingOtherLocation ? otherLocationName.trim().length > 2 : !!selectedLocation)
    : (selectedLocation && selectedRoom);
  const canProceedStep2 = selectedCategory && description.trim().length > 3;

  const handleFinalSubmit = () => {
    const scheduled = urgency === 'schedule';
    const newTicket = {
      id: `TT-${Math.floor(10000 + Math.random() * 90000)}`,
      title: selectedCategory || 'Issue',
      description: description,
      selectedDate: selectedDate,
      selectedTime: selectedTime,
      // Persisted scheduling fields (service_requests.preferred_date / _time).
      preferredDate: scheduled ? toIsoDate(selectedDate) : null,
      preferredTime: scheduled ? selectedTime : null,
      supportMode: supportMode,
      status: 'Open',
      // Which support line the customer picked on the home screen (AV vs EPABX).
      supportCategory: isEpabx ? 'epabx' : 'av',
      location: usingOtherLocation ? otherLocationName.trim() : selectedLocation?.name,
      locationId: usingOtherLocation ? null : selectedLocation?.id,
      // The backend creates this location first when no locationId is supplied.
      newLocationName: usingOtherLocation ? otherLocationName.trim() : null,
      area: area.trim() || null,
      category: selectedCategory,
      // EPABX tickets carry no room.
      room: isEpabx ? null : selectedRoom?.name,
      roomId: isEpabx ? null : selectedRoom?.id,
      time: 'Just now',
      eta: supportMode === 'Remote Support' ? '15 mins' : '2 hrs'
    };
    onComplete(newTicket);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="wizard-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button className="header-icon-btn" onClick={onCancel}>
            <ArrowLeft size={20} />
          </button>
          <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text-secondary)' }}>
            Step {step} of 3
          </span>
          <button style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: '600', padding: '4px 8px', cursor: 'pointer' }} onClick={onCancel}>
            Cancel
          </button>
        </div>

        {/* 3-Step Progress Bar */}
        <div style={{ position: 'relative', height: '4px', background: 'var(--color-border)', borderRadius: '2px', marginBottom: '12px' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: 'var(--color-primary)', borderRadius: '2px', transition: 'width 0.3s ease', width: step === 1 ? '33.3%' : step === 2 ? '66.6%' : '100%' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', color: 'var(--color-text-secondary)' }}>
          <span style={{ color: step >= 1 ? 'var(--color-primary)' : 'inherit' }}>{isEpabx ? 'Location' : 'Location'}</span>
          <span style={{ color: step >= 2 ? 'var(--color-primary)' : 'inherit' }}>Issue</span>
          <span style={{ color: step >= 3 ? 'var(--color-primary)' : 'inherit' }}>Confirm</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

        {/* STEP 1: Facility & Room (AV) / Facility (EPABX) */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: '700', marginBottom: '2px' }}>
              {isEpabx ? 'EPABX Support' : 'AV Support'}
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              {isEpabx ? 'Facility' : 'Facility & Room'}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '18px' }}>
              Select where the support is needed.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>Location</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {locations.map((loc) => {
                    const isSelected = !otherLocation && selectedLocation?.id === loc.id;
                    return (
                      <div
                        key={loc.id}
                        className="card card-clickable"
                        onClick={() => {
                          setOtherLocation(false);
                          setSelectedLocation(loc);
                          setSelectedRoom(null);
                        }}
                        style={{
                          borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                          background: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                          display: 'flex', alignItems: 'center', gap: '12px', padding: '12px'
                        }}
                      >
                        <MapPin size={18} color={isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)'} />
                        <span style={{ fontWeight: '600', fontSize: '14px', color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>{loc.name}</span>
                      </div>
                    );
                  })}

                  {/* "Other" — a new place, EPABX only (an AV ticket needs a configured room). */}
                  {isEpabx && (
                    <div
                      className="card card-clickable"
                      onClick={() => { setOtherLocation(true); setSelectedLocation(null); setSelectedRoom(null); }}
                      style={{
                        borderColor: otherLocation ? 'var(--color-primary)' : 'var(--color-border)',
                        background: otherLocation ? 'var(--color-primary-light)' : 'var(--color-surface)',
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '12px'
                      }}
                    >
                      <MapPin size={18} color={otherLocation ? 'var(--color-primary)' : 'var(--color-text-secondary)'} />
                      <span style={{ fontWeight: '600', fontSize: '14px', color: otherLocation ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>Other (new location)</span>
                    </div>
                  )}

                  {isEpabx && otherLocation && (
                    <input
                      type="text"
                      autoFocus
                      value={otherLocationName}
                      onChange={(e) => setOtherLocationName(e.target.value)}
                      placeholder="Type the location / site name"
                      style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-primary)', background: 'var(--color-surface)', fontSize: '14px', outline: 'none' }}
                    />
                  )}
                </div>
              </div>

              {!isEpabx && selectedLocation && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>Select Room</label>
                  {availableRooms.length === 0 ? (
                    <div className="card" style={{ padding: '14px', borderColor: '#FECACA', background: '#FEF2F2', color: '#991B1B' }}>
                      <div style={{ fontSize: '13px', fontWeight: '800' }}>No rooms configured</div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>A room is mandatory. Ask an administrator to add rooms for this location before creating a request.</div>
                    </div>
                  ) : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {availableRooms.map((rm) => {
                      const isSelected = selectedRoom?.id === rm.id;
                      return (
                        <div
                          key={rm.id}
                          className="card card-clickable"
                          onClick={() => setSelectedRoom(rm)}
                          style={{
                            borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                            background: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                            padding: '12px', textAlign: 'center', fontWeight: '600', fontSize: '13px',
                            color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)'
                          }}
                        >
                          {rm.name}
                        </div>
                      );
                    })}
                  </div>}
                </div>
              )}

              {/* Area — free-typed sub-locality (optional) */}
              {(selectedLocation || usingOtherLocation) && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                    Area <span style={{ fontWeight: '400', color: 'var(--color-text-secondary)' }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="e.g. 3rd Floor East Wing, Reception"
                    style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: '14px', outline: 'none' }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Issue Details */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: '700', marginBottom: '2px' }}>
              {isEpabx
                ? `EPABX Support — ${usingOtherLocation ? otherLocationName.trim() : (selectedLocation?.name || '')}`
                : `${selectedRoom?.name || ''} (${selectedLocation?.name || ''})`}
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              Issue Details
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              What seems to be the problem?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Issue category — the list depends on the support line */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>Category</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {issueCategories.map(cat => (
                     <div
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        style={{
                          padding: '8px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                          background: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-surface)',
                          color: selectedCategory === cat ? '#FFF' : 'var(--color-text-primary)',
                          border: '1px solid', borderColor: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-border)'
                        }}>
                        {cat}
                     </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                  Description <span style={{color: 'var(--color-error)'}}>*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="E.g. The projector won't turn on..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: '14px', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

{/* URGENCY SECTION */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                    When should we come
                  </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <button 
                    type="button"
                    onClick={() => setUrgency('asap')}
                    style={{
                      padding: '16px 12px',
                      borderRadius: '12px',
                      border: urgency === 'asap' ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                      background: urgency === 'asap' ? '#EFF6FF' : '#FFFFFF',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <Zap size={20} color={urgency === 'asap' ? '#2563EB' : '#64748B'} />
                    <span style={{ fontSize: '14px', fontWeight: '800', color: urgency === 'asap' ? '#1E40AF' : '#1E293B' }}>ASAP</span>
                    <span style={{ fontSize: '11px', color: urgency === 'asap' ? '#475569' : '#64748B' }}>Next available</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setUrgency('schedule'); setShowDatePicker(true); setModalStep('date'); }}
                    style={{
                      padding: '16px 12px',
                      borderRadius: '12px',
                      border: urgency === 'schedule' ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                      background: urgency === 'schedule' ? '#EFF6FF' : '#FFFFFF',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <Calendar size={20} color={urgency === 'schedule' ? '#2563EB' : '#64748B'} />
                    <span style={{ fontSize: '14px', fontWeight: '800', color: urgency === 'schedule' ? '#1E40AF' : '#1E293B' }}>Pick a time</span>
                    <span style={{ fontSize: '11px', color: urgency === 'schedule' ? '#475569' : '#64748B' }}>{urgency === 'schedule' && selectedDate?.day ? `${selectedDate.month.substring(0,3)} ${selectedDate.day}, ${selectedTime ? selectedTime.split(' - ')[0] : '...'} ` : 'Choose date & slot'}</span>
                  </button>
                </div>
                
              </div>

              {/* Media / Photos upload is disabled for now — no matching field on
                  the admin ticket and no backing column. Re-enable together with
                  attachment storage on the backend.
              <div>
                <label>Media / Photos (Optional)</label>
                ... Take Photo / Upload File ...
              </div>
              */}

            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & CONFIRM */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              Review & Confirm
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '18px' }}>
              Verify ticket details before dispatching engineer.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Support Line</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{isEpabx ? 'EPABX Support' : 'AV Support'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Location</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{usingOtherLocation ? `${otherLocationName.trim()} (new)` : selectedLocation?.name}</span>
                </div>
                {!isEpabx && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Room</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{selectedRoom?.name}</span>
                  </div>
                )}
                {area.trim() && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Area</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{area.trim()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Issue</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-primary)' }}>{selectedCategory}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Preferred Time</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                    {urgency === 'schedule' && selectedDate?.day
                      ? `${selectedDate.month?.substring(0, 3)} ${selectedDate.day}${selectedTime ? `, ${selectedTime}` : ''}`
                      : 'Next available (ASAP)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Support Mode</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{supportMode}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="wizard-footer">
        {step < 3 ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setStep(step + 1)}
            disabled={(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)}
            style={{ opacity: (step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2) ? 0.5 : 1 }}
          >
            <span>Continue</span>
            <ChevronRight size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={handleFinalSubmit}
            style={{ background: 'var(--color-success)' }}
          >
            <CheckCircle size={18} />
            <span>Submit Service Request</span>
          </button>
        )}
      </div>

                        {/* DATE/TIME PICKER MODAL */}
      {showDatePicker && (
        <div style={{
          position: 'fixed',
          top: 0, bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '410px', /* Matches phone chassis internal width */
          background: 'rgba(0,0,0,0.6)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          pointerEvents: 'auto'
        }}>
          <div style={{
            position: 'relative',
            width: '100%',
            background: '#FFFFFF',
            borderTopLeftRadius: '32px',
            borderTopRightRadius: '32px',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideUp 0.3s ease-out',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.1)'
          }}>
            {/* Top Nav */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 24px 16px 24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#111827', margin: 0 }}>{modalStep === 'date' ? 'Select date' : 'Select time'}</h2>
              <button onClick={() => setShowDatePicker(false)} style={{ background: '#F3F4F6', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color="#4B5563" />
              </button>
            </div>

            {modalStep === 'date' && (
              <div style={{ padding: '0 24px 32px 24px', flex: 1 }}>
                
                {/* Days of week header */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', marginBottom: '24px', borderBottom: '1px solid #E5E7EB', paddingBottom: '12px' }}>
                  {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
                    <div key={day} style={{ fontSize: '10px', color: '#6B7280', fontWeight: '600' }}>{day}</div>
                  ))}
                </div>

                {/* Month/Year Title */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <button
                    type="button"
                    onClick={() => goToMonth(-1)}
                    disabled={isCurrentMonth}
                    aria-label="Previous month"
                    style={{
                      width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #E5E7EB',
                      background: '#fff', cursor: isCurrentMonth ? 'not-allowed' : 'pointer',
                      opacity: isCurrentMonth ? 0.4 : 1, display: 'grid', placeItems: 'center'
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#111827', margin: 0 }}>
                    {currentMonthName} {currentYear}
                  </h3>

                  <button
                    type="button"
                    onClick={() => goToMonth(1)}
                    aria-label="Next month"
                    style={{
                      width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #E5E7EB',
                      background: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center'
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', rowGap: '16px', textAlign: 'center' }}>
                  {calendarDays.map((day, index) => {
                    if (day === null) return <div key={`empty-${index}`} />;
                    
                    const isPast = isPastMonth || (isCurrentMonth && day < todayDay);
                    const isToday = day === todayDay;
                    const isSelected = selectedDate?.day === day;
                    // Columns are MON..SUN, so index 6 is Sunday. Saturday is a
                    // working day and must remain selectable.
                    const colIndex = index % 7;
                    const isNonWorkingDay = colIndex === 6;

                    let color = '#4B5563';
                    if (isPast) color = isNonWorkingDay ? '#FCA5A5' : '#9CA3AF';
                    else if (isNonWorkingDay) color = '#EF4444';
                    
                    if (isSelected) color = '#FFFFFF';

                    return (
                      <button
                        key={day}
                        disabled={isPast}
                        onClick={() => {
                          setSelectedDate({ day, month: currentMonthName, year: currentYear });
                          setModalStep('time');
                        }}
                        style={{
                          height: '36px', width: '36px',
                          margin: '0 auto',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: '50%',
                          background: isSelected ? 'var(--color-primary)' : 'transparent',
                          color: color,
                          border: isToday && !isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                          textDecoration: isPast ? 'line-through' : 'none',
                          cursor: isPast ? 'not-allowed' : 'pointer',
                          fontWeight: isSelected || isToday ? '700' : '500',
                          padding: 0,
                          fontSize: '14px',
                          outline: 'none'
                        }}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {modalStep === 'time' && (
              <div style={{ padding: '0 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '16px', fontWeight: '600' }}>
                  Selected Date: {selectedDate?.month} {selectedDate?.day}, {selectedDate?.year}
                </p>

                <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#111827', margin: '0 0 16px 0' }}>Available time slots</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '24px' }}>
                  {['09:00 AM - 11:00 AM', '11:00 AM - 01:00 PM', '01:00 PM - 03:00 PM', '03:00 PM - 05:00 PM', '05:00 PM - 07:00 PM', '07:00 PM - 09:00 PM'].map(slot => (
                    <button
                      key={slot}
                      onClick={() => setSelectedTime(slot)}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '30px',
                        border: 'none',
                        background: selectedTime === slot ? 'var(--color-primary)' : '#F3F4F6',
                        color: selectedTime === slot ? '#FFFFFF' : '#111827',
                        fontWeight: '700',
                        fontSize: '13px',
                        cursor: 'pointer',
                        outline: 'none',
                        boxShadow: selectedTime === slot ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none'
                      }}
                    >
                      {slot}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 'auto', paddingBottom: '24px' }}>
                  <button
                    disabled={!selectedTime}
                    onClick={() => setShowDatePicker(false)}
                    style={{
                      width: '100%',
                      padding: '16px',
                      background: selectedTime ? 'var(--color-primary)' : '#D1D5DB',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '16px',
                      fontSize: '15px',
                      fontWeight: '800',
                      cursor: selectedTime ? 'pointer' : 'not-allowed',
                      boxShadow: selectedTime ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'none'
                    }}
                  >
                    Confirm Schedule
                  </button>
                  
                  <button 
                    onClick={() => setModalStep('date')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'none',
                      border: 'none',
                      color: '#4B5563',
                      fontSize: '14px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      marginTop: '8px'
                    }}
                  >
                    Back to Date
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
