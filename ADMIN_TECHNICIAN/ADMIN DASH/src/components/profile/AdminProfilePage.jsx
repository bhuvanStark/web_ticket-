import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Mail, 
  Phone, 
  MapPin, 
  Building2, 
  CalendarDays,
  ShieldCheck,
  Award,
  Clock,
  Ticket,
  Wrench,
  ChevronRight,
  Edit2,
  Save,
  X,
  Camera
} from 'lucide-react';

export const AdminProfilePage = () => {
  const { currentUser, setCurrentUser, setActivePage } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);

  // Dummy Activity Logs Data
  const activityLogs = [
    {
      id: 1,
      title: "Assigned Technician to Ticket #8920",
      time: "15 mins ago",
      desc: "Dispatched Ravi Kumar to ABC Technologies for \"Projector Not Syncing\".",
      color: "#004898"
    },
    {
      id: 2,
      title: "Updated System Configuration",
      time: "2 hours ago",
      desc: "Enabled \"Demo Management Module\" and updated SLA threshold to 2 hours.",
      color: "#12B76A"
    },
    {
      id: 3,
      title: "Resolved Customer Dispute",
      time: "Yesterday",
      desc: "Closed escalated ticket #8895 and issued credit note to Global Finance Ltd.",
      color: "#F59E0B"
    },
    {
      id: 4,
      title: "Created New Service Account",
      time: "Aug 24, 2026",
      desc: "Onboarded new client Nexus Corp HQ and populated room equipment inventory.",
      color: "#6941C6"
    },
    {
      id: 5,
      title: "Generated Monthly Performance Report",
      time: "Aug 22, 2026",
      desc: "Exported global technician performance metrics for August 2026.",
      color: "#0284C7"
    },
    {
      id: 6,
      title: "Modified Admin Roles",
      time: "Aug 20, 2026",
      desc: "Granted \"Inventory Management\" access to the Service Manager role.",
      color: "#F04438"
    },
    {
      id: 7,
      title: "System Maintenance Login",
      time: "Aug 18, 2026",
      desc: "Logged in during scheduled maintenance window to verify database integrity.",
      color: "#475467"
    },
    {
      id: 8,
      title: "Added New Equipment Type",
      time: "Aug 15, 2026",
      desc: "Added \"Interactive Whiteboard (Series 7)\" to the global equipment catalog.",
      color: "#12B76A"
    }
  ];

  // Form State
  const [formData, setFormData] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: '+91 98765 12345',
    department: 'Service Operations',
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
    // In a real app, you would save to backend and update context
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
    <div className="page-body">
      {/* Breadcrumb / Top Bar */}
      <div className="flex items-center gap-2 text-sm text-[#667085] mb-6">
        <span 
          className="hover:text-[#004898] cursor-pointer transition-colors"
          onClick={() => setActivePage('dashboard')}
        >
          Dashboard
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="font-bold text-[#172033]">Admin Profile</span>
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
                    department: 'Service Operations',
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
                Global Admin
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
                    className="text-xl font-extrabold text-[#172033] text-center border-b-2 border-[#004898] focus:outline-none bg-transparent mb-1 px-2 py-1 w-full max-w-[200px]"
                  />
                ) : (
                  <h2 className="text-xl font-extrabold text-[#172033] mb-1">{formData.name}</h2>
                )}
                
                <p className="text-[#667085] text-sm font-medium mt-1">{currentUser.roleLabel}</p>
                
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <span className="inline-flex items-center gap-1 bg-[#EFF5FC] text-[#004898] text-xs font-bold px-2.5 py-1 rounded-lg border border-[#B3D1F2]">
                    System Administrator
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
                <Ticket className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-[#667085] font-bold uppercase tracking-wider mb-1">Tickets Managed</p>
                <p className="text-3xl font-extrabold text-[#172033]">1,248</p>
              </div>
            </div>

            <div className="bg-white border border-[#E4E7EC] rounded-2xl shadow-sm p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#F0FDF4] text-[#12B76A] flex items-center justify-center shrink-0">
                <Wrench className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-[#667085] font-bold uppercase tracking-wider mb-1">Techs Dispatched</p>
                <p className="text-3xl font-extrabold text-[#172033]">342</p>
              </div>
            </div>
          </div>

          {/* Activity Log / System History */}
          <div className="bg-white border border-[#E4E7EC] rounded-2xl shadow-sm flex-1">
            <div className="p-6 border-b border-[#F2F4F7] flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-[#172033]">Recent System Activity</h3>
                <p className="text-xs text-[#667085] mt-0.5">Your most recent administrative actions.</p>
              </div>
              <button 
                onClick={() => setIsLogsExpanded(!isLogsExpanded)}
                className="text-xs font-bold text-[#004898] hover:text-[#00346E] transition-colors"
              >
                {isLogsExpanded ? 'Show Less Logs' : 'View Full Logs'}
              </button>
            </div>
            
            <div className={`p-6 ${isLogsExpanded ? 'max-h-[500px] overflow-y-auto' : ''}`}>
              <div className="relative border-l-2 border-[#E4E7EC] ml-3 space-y-8">
                
                {(isLogsExpanded ? activityLogs : activityLogs.slice(0, 4)).map((log, index) => (
                  <div key={log.id} className="relative pl-6">
                    <div 
                      className="absolute -left-[9px] top-1 w-4 h-4 bg-white border-2 rounded-full"
                      style={{ borderColor: log.color }}
                    ></div>
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <h4 className="text-sm font-bold text-[#172033]">{log.title}</h4>
                      <span className="text-xs font-semibold text-[#667085] shrink-0">{log.time}</span>
                    </div>
                    <p className="text-xs text-[#667085]">{log.desc}</p>
                  </div>
                ))}

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
