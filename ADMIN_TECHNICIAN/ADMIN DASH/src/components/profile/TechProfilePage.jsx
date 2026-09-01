import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Mail, Phone, MapPin, Building2, ShieldCheck, 
  ChevronRight, Edit2, Save, X, Camera, CheckCircle2, Clock
} from 'lucide-react';

export const TechProfilePage = () => {
  const { currentUser, setCurrentUser, setActivePage, tickets } = useApp();
  const [isEditing, setIsEditing] = useState(false);

  // Filter completed/resolved tickets for this tech
  let recentServices = (tickets || [])
    .filter(t => 
      (t.assignedTo === currentUser?.name || t.assignedToId === currentUser?.id) && 
      (t.status === 'Resolved' || t.status === 'Closed' || t.status === 'Customer Signed / Completed')
    )
    .sort((a, b) => new Date(b.lastUpdated || b.createdAt || 0) - new Date(a.lastUpdated || a.createdAt || 0))
    .slice(0, 5);

  if (recentServices.length === 0) {
    recentServices = [
      {
        id: 'TT-76829',
        title: 'Projector Calibration & Lens Cleaning',
        lastUpdated: 'Yesterday, 4:30 PM',
        customer: 'Nexus Corp HQ',
        room: 'Main Auditorium',
        resolution: 'Calibrated dual Christie projectors, aligned edge blending, and cleaned lenses. Tested with matrix switcher.'
      },
      {
        id: 'TT-64211',
        title: 'Microphone Array Firmware Update',
        lastUpdated: 'Aug 24, 2026',
        customer: 'Global Finance Ltd',
        room: 'Boardroom A',
        resolution: 'Updated Shure MXA910 firmware to latest version. Adjusted lobe aiming and verified DSP automix.'
      },
      {
        id: 'TT-59002',
        title: 'Video Wall Processor Replacement',
        lastUpdated: 'Aug 21, 2026',
        customer: 'TechVision Solutions',
        room: 'Control Center',
        resolution: 'Replaced faulty input card on video wall processor. Re-routed HDMI sources and tested continuous 4K playback.'
      }
    ];
  }

  // Form State
  const [formData, setFormData] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: '+91 98765 12345',
    department: 'Field Services',
    location: 'Bengaluru HQ',
    avatar: currentUser?.avatar || ''
  });
  
  const fileInputRef = useRef(null);
  
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setFormData(prev => ({ ...prev, avatar: imageUrl }));
    }
  };

  const handleSave = () => {
    if (setCurrentUser) {
       setCurrentUser({
         ...currentUser,
         name: formData.name,
         email: formData.email,
         avatar: formData.avatar || currentUser.avatar
       });
    }
    setIsEditing(false);
  };

  return (
    <div className="page-body animate-in fade-in duration-300">
      {/* Breadcrumb / Top Bar */}
      <div className="flex items-center gap-2 text-sm text-[#667085] mb-6">
        <span 
          className="hover:text-[#004898] cursor-pointer transition-colors"
          onClick={() => setActivePage('my-dashboard')}
        >
          My Dashboard
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="font-bold text-[#172033]">My Profile</span>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-extrabold text-[#172033]">My Profile</h1>
           <p className="text-sm text-[#667085] mt-1">Manage your personal information and account settings.</p>
        </div>
        <div>
          {!isEditing ? (
            <button 
              onClick={() => setIsEditing(true)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Profile
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  setIsEditing(false);
                  setFormData({
                    name: currentUser?.name || '',
                    email: currentUser?.email || '',
                    phone: '+91 98765 12345',
                    department: 'Field Services',
                    location: 'Bengaluru HQ',
                    avatar: currentUser?.avatar || ''
                  });
                }}
                className="btn bg-white border border-[#E4E7EC] text-[#667085] hover:bg-[#F8FAFC] flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="btn btn-primary flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-white border border-[#E4E7EC] rounded-2xl overflow-hidden shadow-sm">
            {/* Cover Banner */}
            <div className="h-32 bg-gradient-to-r from-[#004898] to-[#0284C7] relative">
              <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/30 text-white text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Field Technician
              </div>
            </div>
            
            {/* Avatar & Basic Info */}
            <div className="px-6 pb-6 relative">
              <div className="flex justify-center -mt-16 mb-4 relative z-10">
                <div className="relative group">
                  <img 
                    src={formData.avatar || currentUser.avatar} 
                    alt={currentUser.name} 
                    className="w-32 h-32 rounded-full border-4 border-white shadow-md object-cover bg-white"
                  />
                  {isEditing && (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Camera className="w-6 h-6 text-white mb-1" />
                      <span className="text-white text-[10px] font-bold uppercase tracking-wider">Change</span>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handlePhotoUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>
              </div>
              
              <div className="text-center">
                {isEditing ? (
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="text-xl font-extrabold text-[#172033] text-center border-b-2 border-[#E4E7EC] focus:border-[#004898] focus:outline-none bg-transparent mb-1 px-2 py-1 w-full max-w-[200px]"
                  />
                ) : (
                  <h2 className="text-xl font-extrabold text-[#172033] mb-1">{formData.name}</h2>
                )}
                
                <p className="text-[#667085] text-sm font-medium mt-1">{currentUser.roleLabel || 'Field Service Technician'}</p>
                
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <span className="inline-flex items-center gap-1 bg-[#EFF5FC] text-[#004898] text-xs font-bold px-2.5 py-1 rounded-lg border border-[#B3D1F2]">
                    Field Services
                  </span>
                  <span className="inline-flex items-center gap-1 bg-[#F0FDF4] text-[#12B76A] text-xs font-bold px-2.5 py-1 rounded-lg border border-[#ABE5C6]">
                    Active
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Details Card */}
          <div className="bg-white border border-[#E4E7EC] rounded-2xl shadow-sm p-6">
            <h3 className="text-sm font-extrabold text-[#172033] mb-4 uppercase tracking-wider">Contact Information</h3>
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0 mt-0.5">
                  <Mail className="w-4 h-4 text-[#667085]" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-[#667085] font-semibold uppercase mb-1">Email Address</p>
                  {isEditing ? (
                    <input 
                      type="email" 
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full text-sm font-medium text-[#172033] bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg px-3 py-2 focus:outline-none focus:border-[#004898]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[#172033] break-all">{formData.email}</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0 mt-0.5">
                  <Phone className="w-4 h-4 text-[#667085]" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-[#667085] font-semibold uppercase mb-1">Phone Number</p>
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full text-sm font-medium text-[#172033] bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg px-3 py-2 focus:outline-none focus:border-[#004898]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[#172033]">{formData.phone}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0 mt-0.5">
                  <Building2 className="w-4 h-4 text-[#667085]" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-[#667085] font-semibold uppercase mb-1">Department</p>
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={formData.department}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                      className="w-full text-sm font-medium text-[#172033] bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg px-3 py-2 focus:outline-none focus:border-[#004898]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[#172033]">{formData.department}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4 text-[#667085]" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-[#667085] font-semibold uppercase mb-1">Base Location</p>
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      className="w-full text-sm font-medium text-[#172033] bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg px-3 py-2 focus:outline-none focus:border-[#004898]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[#172033]">{formData.location}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Stats & Activity */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E4E7EC] rounded-2xl shadow-sm p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#EFF5FC] text-[#004898] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-[#667085] font-bold uppercase tracking-wider mb-1">Jobs Completed</p>
                <p className="text-3xl font-extrabold text-[#172033]">156</p>
              </div>
            </div>

            <div className="bg-white border border-[#E4E7EC] rounded-2xl shadow-sm p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#F0FDF4] text-[#12B76A] flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-[#667085] font-bold uppercase tracking-wider mb-1">SLA Compliance</p>
                <p className="text-3xl font-extrabold text-[#172033]">98.5%</p>
              </div>
            </div>
          </div>
          
          {/* Service Logs / Recent Activity */}
          <div className="bg-white border border-[#E4E7EC] rounded-2xl shadow-sm flex-1 flex flex-col">
            <div className="p-6 border-b border-[#F2F4F7] flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-[#172033]">Recent Service Logs</h3>
                <p className="text-xs text-[#667085] mt-0.5">Your most recently completed jobs and field activities.</p>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[500px]">
              <div className="relative border-l-2 border-[#E4E7EC] ml-3 space-y-6">
                
                {recentServices.length > 0 ? (
                  recentServices.map((job, index) => (
                    <div key={job.id} className="relative pl-6">
                      <div className="absolute -left-[9px] top-1 w-4 h-4 bg-white border-2 border-[#12B76A] rounded-full"></div>
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h4 className="text-sm font-bold text-[#172033]">Resolved: {job.title}</h4>
                        <span className="text-xs font-semibold text-[#667085] shrink-0">{job.lastUpdated || job.createdAt || 'Recently'}</span>
                      </div>
                      <p className="text-xs text-[#667085] mb-2">{job.customer} • {job.room}</p>
                      <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E4E7EC]">
                        <p className="text-xs text-[#475467] italic">"{job.resolution || job.serviceReport?.workPerformed || 'Standard maintenance and repair completed successfully.'}"</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-[#667085]">No recent service logs available yet.</p>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
