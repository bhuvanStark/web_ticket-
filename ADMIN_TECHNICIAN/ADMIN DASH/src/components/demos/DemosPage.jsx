import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Tv, 
  MapPin, 
  Plus, 
  Search, 
  Clock, 
  CheckCircle, 
  Building2, 
  Sparkles, 
  Calendar, 
  UserCheck, 
  ChevronRight, 
  X, 
  Send, 
  Monitor, 
  Check, 
  Filter,
  ExternalLink
} from 'lucide-react';

const DEMO_LOCATIONS = [
  {
    id: 'LOC-EC-01',
    name: 'Bengaluru Flagship Experience Center',
    type: 'Experience Center',
    city: 'Bengaluru',
    address: 'Indiranagar 100ft Road, Bengaluru',
    featuredRoom: 'Boardroom 4K AI & Shure Array Suite',
    status: 'Available',
    capacity: '12 Seats'
  },
  {
    id: 'LOC-EC-02',
    name: 'Mumbai Corporate Innovation Hub',
    type: 'Experience Center',
    city: 'Mumbai',
    address: 'BKC Financial Center, Mumbai',
    featuredRoom: 'Dual 85" MicroLED & Biamp DSP Studio',
    status: 'Available',
    capacity: '18 Seats'
  },
  {
    id: 'LOC-EC-03',
    name: 'Chennai Tech Experience Studio',
    type: 'Experience Center',
    city: 'Chennai',
    address: 'OMR Tech Corridor, Chennai',
    featuredRoom: 'Huddle Room & Wireless Barco CX-30',
    status: 'Available',
    capacity: '8 Seats'
  },
  {
    id: 'LOC-CP-04',
    name: 'Deployable Client Place Onsite Kit',
    type: 'Client Place',
    city: 'Pan-India',
    address: 'Onsite Customer Office / Facility',
    featuredRoom: 'Portable Rally Bar & Touch Flight Case',
    status: 'Ready to Ship',
    capacity: 'Onsite'
  }
];

const INITIAL_DEMOS = [
  {
    id: 'DEM-2041',
    clientName: 'Reliance Industries',
    locationType: 'Experience Center',
    venue: 'Bengaluru Flagship Experience Center',
    equipment: 'Logitech Rally Bar Ultra-HD + Crestron 10.1 Touch + Shure Mic',
    date: '22 Aug 2026',
    timeSlot: '11:00 AM - 12:30 PM',
    specialist: 'Ravi Kumar (AV Solutions Lead)',
    status: 'Scheduled',
    notes: 'Executive Boardroom demo for 14 C-level attendees.'
  },
  {
    id: 'DEM-2042',
    clientName: 'HDFC Bank Corporate Office',
    locationType: 'Client Place',
    venue: 'HDFC Towers, BKC Mumbai (Room 502)',
    equipment: 'Biamp TesiraFORTÉ DSP + Extron 4K Switcher Kit',
    date: '21 Aug 2026',
    timeSlot: '02:30 PM - 04:00 PM',
    specialist: 'Anand Verma (Senior Solutions Specialist)',
    status: 'Live Today',
    notes: 'Onsite proof-of-concept audio DSP demonstration.'
  },
  {
    id: 'DEM-2043',
    clientName: 'Infosys Innovation Labs',
    locationType: 'Experience Center',
    venue: 'Mumbai Corporate Innovation Hub',
    equipment: 'Absen 138" MicroLED Cabinet + Barco ClickShare CX-30',
    date: '20 Aug 2026',
    timeSlot: '10:00 AM - 11:30 AM',
    specialist: 'Deepak Sharma (Compute Specialist)',
    status: 'Completed',
    notes: 'Showroom presentation of all-in-one MicroLED display.'
  },
  {
    id: 'DEM-2044',
    clientName: 'Wipro Digital Center',
    locationType: 'Client Place',
    venue: 'Wipro Campus, Electronic City Bengaluru',
    equipment: 'Crestron TS-1070 Touch Panel + Neat Bar Pro',
    date: '23 Aug 2026',
    timeSlot: '03:00 PM - 04:30 PM',
    specialist: 'Priya Patel (Peripherals Lead)',
    status: 'Scheduled',
    notes: 'Onsite touch panel workflow integration trial.'
  }
];

export const DemosPage = () => {
  const { showToast } = useApp();

  const [demos, setDemos] = useState(INITIAL_DEMOS);
  const [activeTypeTab, setActiveTypeTab] = useState('All'); // 'All' | 'Client Place' | 'Experience Center'
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Demo Form State
  const [newDemo, setNewDemo] = useState({
    clientName: '',
    locationType: 'Experience Center',
    venue: 'Bengaluru Flagship Experience Center',
    equipment: 'Logitech Rally Bar Ultra-HD + Crestron 10.1 Touch',
    date: '2026-08-23',
    timeSlot: '11:00 AM - 12:30 PM',
    specialist: 'Ravi Kumar (AV Solutions Lead)',
    notes: ''
  });

  const handleCreateDemo = (e) => {
    e.preventDefault();
    const created = {
      id: `DEM-${Math.floor(2000 + Math.random() * 999)}`,
      clientName: newDemo.clientName,
      locationType: newDemo.locationType,
      venue: newDemo.venue,
      equipment: newDemo.equipment,
      date: newDemo.date,
      timeSlot: newDemo.timeSlot,
      specialist: newDemo.specialist,
      status: 'Scheduled',
      notes: newDemo.notes || 'AV Demo session booked.'
    };

    setDemos([created, ...demos]);
    setShowCreateModal(false);
    setNewDemo({
      clientName: '',
      locationType: 'Experience Center',
      venue: 'Bengaluru Flagship Experience Center',
      equipment: 'Logitech Rally Bar Ultra-HD + Crestron 10.1 Touch',
      date: '2026-08-23',
      timeSlot: '11:00 AM - 12:30 PM',
      specialist: 'Ravi Kumar (AV Solutions Lead)',
      notes: ''
    });

    if (showToast) {
      showToast(`Demo Request ${created.id} scheduled for ${created.clientName}!`, 'success');
    }
  };

  const handleUpdateStatus = (demoId, newStatus) => {
    setDemos(prev => prev.map(d => {
      if (d.id === demoId) return { ...d, status: newStatus };
      return d;
    }));
    if (showToast) showToast(`Demo ${demoId} updated to "${newStatus}"!`, 'info');
  };

  // Filtered Demos
  const filteredDemos = demos.filter(d => {
    const q = searchQuery.toLowerCase();
    const matchQ = d.clientName.toLowerCase().includes(q) ||
                   d.id.toLowerCase().includes(q) ||
                   d.venue.toLowerCase().includes(q) ||
                   d.equipment.toLowerCase().includes(q);

    const matchType = activeTypeTab === 'All' || d.locationType === activeTypeTab;

    return matchQ && matchType;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E4E7EC] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-[#172033]">Demo Management</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#EFF5FC] text-[#004898] border border-[#B3D1F2]">
              Client Place & Experience Center
            </span>
          </div>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            Schedule and manage AV equipment walkthroughs at customer sites or flagship Experience Centers.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004898] text-white font-extrabold text-xs rounded-lg hover:bg-[#00346E] shadow-xs transition-all"
        >
          <Plus className="w-4 h-4 text-[#38BDF8]" />
          <span>+ Book Demo Request</span>
        </button>
      </div>

      {/* Available Demo Locations Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-[#667085] uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-[#004898]" />
            Available Demo Venues & Hubs
          </h3>
          <span className="text-xs text-[#004898] font-bold">4 Venues Ready</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {DEMO_LOCATIONS.map(loc => (
            <div key={loc.id} className="p-3.5 bg-white rounded-xl border border-[#E4E7EC] shadow-xs hover:border-[#004898] transition-all space-y-2">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                  loc.type === 'Experience Center'
                    ? 'bg-[#EFF5FC] text-[#004898] border border-[#B3D1F2]'
                    : 'bg-[#FDF2FA] text-[#C11574] border border-[#FCCEEE]'
                }`}>
                  {loc.type === 'Experience Center' ? '🌟 Showroom' : '🏢 Client Place'}
                </span>
                <span className="text-[10px] font-extrabold text-[#027A48] bg-[#ECFDF5] px-1.5 py-0.5 rounded">
                  ✓ {loc.status}
                </span>
              </div>

              <div>
                <div className="font-extrabold text-xs text-[#172033] leading-snug">{loc.name}</div>
                <div className="text-[11px] text-[#667085] flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-[#98A2B3]" />
                  <span>{loc.city}</span>
                </div>
              </div>

              <div className="text-[11px] text-[#475467] bg-[#F8FAFC] p-2 rounded border border-[#E4E7EC] leading-tight">
                <strong className="text-[#172033]">Featured Setup:</strong> {loc.featuredRoom}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter & View Tabs */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-[#E4E7EC]">
        {/* Segmented Control Tabs */}
        <div className="bg-[#F2F4F7] p-1 rounded-xl flex items-center border border-[#E4E7EC] w-full sm:w-auto">
          {['All', 'Client Place', 'Experience Center'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTypeTab(tab)}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                activeTypeTab === tab
                  ? 'bg-white text-[#004898] shadow-xs'
                  : 'text-[#667085] hover:text-[#172033]'
              }`}
            >
              {tab === 'Client Place' && '🏢 '}
              {tab === 'Experience Center' && '🌟 '}
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search client, venue, equipment..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-semibold focus:outline-none focus:border-[#004898]"
          />
        </div>
      </div>

      {/* Demos Table */}
      <div className="bg-white rounded-xl border border-[#E4E7EC] overflow-hidden shadow-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC] text-xs font-extrabold text-[#475467] uppercase tracking-wider">
              <th className="py-3 px-4">Demo ID</th>
              <th className="py-3 px-4">Client / Prospect</th>
              <th className="py-3 px-4">Location Type & Venue</th>
              <th className="py-3 px-4">Featured Equipment</th>
              <th className="py-3 px-4">Date & Time Slot</th>
              <th className="py-3 px-4">Specialist</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E7EC] text-xs">
            {filteredDemos.map(demo => (
              <tr key={demo.id} className="hover:bg-[#F8FAFC] transition-colors">
                <td className="py-3.5 px-4 font-mono font-extrabold text-[#004898]">{demo.id}</td>
                <td className="py-3.5 px-4">
                  <div className="font-extrabold text-[#172033]">{demo.clientName}</div>
                </td>
                <td className="py-3.5 px-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold mb-1 ${
                    demo.locationType === 'Experience Center'
                      ? 'bg-[#EFF5FC] text-[#004898] border border-[#B3D1F2]'
                      : 'bg-[#FDF2FA] text-[#C11574] border border-[#FCCEEE]'
                  }`}>
                    {demo.locationType === 'Experience Center' ? '🌟 Experience Center' : '🏢 Client Place'}
                  </span>
                  <div className="text-[11px] text-[#475467] font-semibold">{demo.venue}</div>
                </td>
                <td className="py-3.5 px-4 text-[#475467] max-w-xs leading-snug">
                  {demo.equipment}
                </td>
                <td className="py-3.5 px-4">
                  <div className="font-extrabold text-[#172033]">{demo.date}</div>
                  <div className="text-[11px] text-[#667085]">{demo.timeSlot}</div>
                </td>
                <td className="py-3.5 px-4 font-bold text-[#172033]">
                  {demo.specialist}
                </td>
                <td className="py-3.5 px-4">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                    demo.status === 'Live Today' ? 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]' :
                    demo.status === 'Scheduled' ? 'bg-[#EFF5FC] text-[#004898] border border-[#B3D1F2]' :
                    'bg-[#F2F4F7] text-[#475467]'
                  }`}>
                    {demo.status === 'Live Today' && <Sparkles className="w-3 h-3 text-[#12B76A]" />}
                    {demo.status === 'Scheduled' && <Clock className="w-3 h-3 text-[#004898]" />}
                    {demo.status === 'Completed' && <CheckCircle className="w-3 h-3 text-[#667085]" />}
                    <span>{demo.status}</span>
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right">
                  {demo.status !== 'Completed' ? (
                    <button
                      onClick={() => handleUpdateStatus(demo.id, 'Completed')}
                      className="px-2.5 py-1 bg-[#12B76A] hover:bg-[#0E9355] text-white text-[11px] font-extrabold rounded-lg inline-flex items-center gap-1 shadow-xs transition-all"
                    >
                      <Check className="w-3 h-3" />
                      <span>Mark Complete</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#667085] font-bold">Done</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CREATE DEMO REQUEST MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-[#E4E7EC] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EFF5FC] text-[#004898] flex items-center justify-center border border-[#B3D1F2]">
                  <Tv className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold text-[#172033]">Book Demo Request</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-[#667085] hover:text-[#172033]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDemo} className="space-y-3.5">
              <div>
                <label className="text-xs font-extrabold text-[#172033] block mb-1">Demo Location Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewDemo({
                      ...newDemo,
                      locationType: 'Experience Center',
                      venue: 'Bengaluru Flagship Experience Center'
                    })}
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold border transition-all ${
                      newDemo.locationType === 'Experience Center'
                        ? 'bg-[#EFF5FC] text-[#004898] border-[#004898]'
                        : 'bg-[#F8FAFC] text-[#475467] border-[#E4E7EC]'
                    }`}
                  >
                    🌟 Experience Center
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewDemo({
                      ...newDemo,
                      locationType: 'Client Place',
                      venue: 'Client Office / Onsite Facility'
                    })}
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold border transition-all ${
                      newDemo.locationType === 'Client Place'
                        ? 'bg-[#FDF2FA] text-[#C11574] border-[#C11574]'
                        : 'bg-[#F8FAFC] text-[#475467] border-[#E4E7EC]'
                    }`}
                  >
                    🏢 Client Place (Onsite)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold text-[#172033] block mb-1">Client / Prospect Name *</label>
                <input
                  type="text"
                  required
                  value={newDemo.clientName}
                  onChange={(e) => setNewDemo({ ...newDemo, clientName: e.target.value })}
                  placeholder="e.g. Reliance Tech, HDFC Corporate..."
                  className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-semibold focus:outline-none focus:border-[#004898]"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-[#172033] block mb-1">Venue / Specific Address *</label>
                {newDemo.locationType === 'Experience Center' ? (
                  <select
                    value={newDemo.venue}
                    onChange={(e) => setNewDemo({ ...newDemo, venue: e.target.value })}
                    className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
                  >
                    <option value="Bengaluru Flagship Experience Center">Bengaluru Flagship Experience Center</option>
                    <option value="Mumbai Corporate Innovation Hub">Mumbai Corporate Innovation Hub</option>
                    <option value="Chennai Tech Experience Studio">Chennai Tech Experience Studio</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={newDemo.venue}
                    onChange={(e) => setNewDemo({ ...newDemo, venue: e.target.value })}
                    placeholder="e.g. HDFC Towers, BKC Mumbai, Room 502"
                    className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-semibold focus:outline-none"
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-extrabold text-[#172033] block mb-1">Featured Equipment Setup</label>
                <input
                  type="text"
                  required
                  value={newDemo.equipment}
                  onChange={(e) => setNewDemo({ ...newDemo, equipment: e.target.value })}
                  placeholder="e.g. Logitech Rally Bar 4K + Crestron Touch"
                  className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-semibold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold text-[#172033] block mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={newDemo.date}
                    onChange={(e) => setNewDemo({ ...newDemo, date: e.target.value })}
                    className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
                  />
                </div>

                <div>
                  <label className="text-xs font-extrabold text-[#172033] block mb-1">Time Slot</label>
                  <input
                    type="text"
                    value={newDemo.timeSlot}
                    onChange={(e) => setNewDemo({ ...newDemo, timeSlot: e.target.value })}
                    placeholder="11:00 AM - 12:30 PM"
                    className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-semibold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold text-[#172033] block mb-1">Assigned Demo Specialist</label>
                <select
                  value={newDemo.specialist}
                  onChange={(e) => setNewDemo({ ...newDemo, specialist: e.target.value })}
                  className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
                >
                  <option value="Ravi Kumar (AV Solutions Lead)">Ravi Kumar (AV Solutions Lead)</option>
                  <option value="Anand Verma (Senior Solutions Specialist)">Anand Verma (Senior Specialist)</option>
                  <option value="Deepak Sharma (Compute Specialist)">Deepak Sharma (Compute Specialist)</option>
                  <option value="Priya Patel (Peripherals Lead)">Priya Patel (Peripherals Lead)</option>
                </select>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 bg-white border border-[#E4E7EC] rounded-lg text-xs font-extrabold text-[#344054]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#004898] text-white rounded-lg text-xs font-extrabold hover:bg-[#00346E] flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Schedule Demo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
