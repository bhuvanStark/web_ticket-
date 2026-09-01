import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Settings, 
  Shield, 
  Bell, 
  Save, 
  Globe, 
  Smartphone, 
  Database,
  Camera,
  MapPin,
  Clock,
  Briefcase,
  Zap,
  Layout,
  Layers,
  Package,
  Sparkles,
  Ticket,
  Users,
  Tv,
  Wrench,
  Calendar,
  History,
  BarChart3
} from 'lucide-react';

export const SettingsPage = () => {
  const { showToast, enabledModules, setEnabledModules, saveAppSettings } = useApp();
  const [activeTab, setActiveTab] = useState('general'); // 'general', 'policies', 'modules'
  const [isSaving, setIsSaving] = useState(false);

  const [settings, setSettings] = useState({
    slaHours: '2',
    dispatchStrategy: 'proximity',
    emailAlerts: true,
    criticalSms: true,
    timezone: 'Asia/Kolkata',
    language: 'en',
    gpsTracking: true,
    offlineMode: true,
    photoProof: true,
    crmSync: false,
    autoEscalate: true,
    escalationHours: '4'
  });

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await saveAppSettings();
      showToast('System configurations updated successfully!', 'success');
    } catch (err) {
      showToast(err?.message || 'Could not save configuration. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-2xl md:text-3xl font-black text-[#172033] tracking-tight">System Configuration</h2>
        <p className="text-sm text-[#667085] mt-1.5 max-w-2xl leading-relaxed">
          Manage your organization's global settings, SLA policies, technician app behaviors, and external integrations.
        </p>
      </div>

      {/* Main Layout Container */}
      <div className="flex flex-col md:flex-row gap-8 items-start">
        
        {/* Vertical Left Sidebar Navigation */}
        <div className="w-full md:w-64 shrink-0">
          <div className="flex flex-col space-y-1 bg-white p-2 rounded-2xl border border-[#E4E7EC] shadow-sm">
            <button 
              onClick={() => setActiveTab('general')}
              className={`px-4 py-3 text-sm font-bold text-left rounded-xl transition-colors flex items-center gap-3 ${
                activeTab === 'general' 
                  ? 'bg-[#004898] text-white' 
                  : 'text-[#667085] hover:bg-[#F8FAFC] hover:text-[#172033]'
              }`}
            >
              <Globe className="w-4 h-4" />
              General
            </button>
            <button 
              onClick={() => setActiveTab('policies')}
              className={`px-4 py-3 text-sm font-bold text-left rounded-xl transition-colors flex items-center gap-3 ${
                activeTab === 'policies' 
                  ? 'bg-[#004898] text-white' 
                  : 'text-[#667085] hover:bg-[#F8FAFC] hover:text-[#172033]'
              }`}
            >
              <Shield className="w-4 h-4" />
              SLA & Policies
            </button>
            <button 
              onClick={() => setActiveTab('modules')}
              className={`px-4 py-3 text-sm font-bold text-left rounded-xl transition-colors flex items-center gap-3 ${
                activeTab === 'modules' 
                  ? 'bg-[#004898] text-white' 
                  : 'text-[#667085] hover:bg-[#F8FAFC] hover:text-[#172033]'
              }`}
            >
              <Layout className="w-4 h-4" />
              Modules
            </button>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 w-full">
          <form onSubmit={handleSave} className="space-y-8 max-w-4xl">
            
            {/* General Preferences */}
            {activeTab === 'general' && (
        <div className="bg-white rounded-2xl p-8 border border-[#E4E7EC] shadow-sm animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#E4E7EC]">
            <div className="w-10 h-10 rounded-xl bg-[#EFF5FC] text-[#004898] flex items-center justify-center">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#172033]">General Preferences</h3>
              <p className="text-xs text-[#667085] mt-0.5">Localization and basic operational defaults.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-1.5">System Timezone</label>
              <select 
                value={settings.timezone}
                onChange={(e) => handleChange('timezone', e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#004898] focus:ring-1 focus:ring-[#004898] transition-colors"
              >
                <option value="Asia/Kolkata">IST (Indian Standard Time)</option>
                <option value="America/New_York">EST (Eastern Standard Time)</option>
                <option value="Europe/London">GMT (Greenwich Mean Time)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-1.5">Default Language</label>
              <select 
                value={settings.language}
                onChange={(e) => handleChange('language', e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#004898] focus:ring-1 focus:ring-[#004898] transition-colors"
              >
                <option value="en">English (US)</option>
                <option value="en-gb">English (UK)</option>
                <option value="es">Spanish</option>
              </select>
            </div>
          </div>
        </div>
        )}

        {/* SLA & Dispatch Controls */}
        {activeTab === 'policies' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-white rounded-2xl p-8 border border-[#E4E7EC] shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#E4E7EC]">
            <div className="w-10 h-10 rounded-xl bg-[#FFFBEB] text-[#B54708] flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#172033]">SLA & Dispatch Policies</h3>
              <p className="text-xs text-[#667085] mt-0.5">Define response targets and auto-assignment rules.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-1.5">Critical Ticket Target SLA (Hours)</label>
              <input
                type="number"
                value={settings.slaHours}
                onChange={(e) => handleChange('slaHours', e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#004898] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-1.5">Default Dispatch Strategy</label>
              <select 
                value={settings.dispatchStrategy}
                onChange={(e) => handleChange('dispatchStrategy', e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#004898] transition-colors"
              >
                <option value="proximity">Proximity & Workload Auto-Match</option>
                <option value="manual">Manual Coordinator Assignment</option>
                <option value="roundrobin">Round Robin Distribution</option>
              </select>
            </div>
          </div>

          <label className="flex items-start gap-4 p-4 rounded-xl border border-[#E4E7EC] hover:border-[#B3D1F2] hover:bg-[#F8FAFC] transition-colors cursor-pointer group">
            <div className="mt-0.5">
              <button
                type="button"
                onClick={() => handleChange('autoEscalate', !settings.autoEscalate)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  settings.autoEscalate ? 'bg-[#004898]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.autoEscalate ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div className="flex-1">
              <span className="font-bold text-[#172033] block text-sm group-hover:text-[#004898]">Auto-Escalate Unresolved Tickets</span>
              <span className="text-xs text-[#667085] mt-0.5 block">Automatically notify L3 engineering if a ticket remains open past its initial SLA threshold.</span>
            </div>
            {settings.autoEscalate && (
              <div className="w-24 shrink-0">
                <input
                  type="number"
                  value={settings.escalationHours}
                  onChange={(e) => handleChange('escalationHours', e.target.value)}
                  className="w-full bg-white border border-[#E4E7EC] text-xs text-[#172033] rounded-lg px-2 py-1.5 text-center focus:outline-none focus:border-[#004898]"
                  title="Hours before escalation"
                />
                <span className="text-[10px] text-center block text-[#667085] mt-1 font-bold uppercase">Hours</span>
              </div>
            )}
          </label>
        </div>

        {/* Technician App Settings */}
        <div className="bg-white rounded-2xl p-8 border border-[#E4E7EC] shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#E4E7EC]">
            <div className="w-10 h-10 rounded-xl bg-[#F0FDF4] text-[#12B76A] flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#172033]">Technician Mobile App Config</h3>
              <p className="text-xs text-[#667085] mt-0.5">Control features available to field technicians on their devices.</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#ABE5C6] hover:bg-[#F6FEF9] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-[#667085] group-hover:text-[#12B76A]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#027A48]">Enable GPS Tracking during shifts</span>
                  <span className="text-xs text-[#667085]">Allow dispatchers to view live technician locations for proximity routing.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleChange('gpsTracking', !settings.gpsTracking)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  settings.gpsTracking ? 'bg-[#12B76A]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.gpsTracking ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#ABE5C6] hover:bg-[#F6FEF9] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Camera className="w-4 h-4 text-[#667085] group-hover:text-[#12B76A]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#027A48]">Require Photo Proof for Job Closure</span>
                  <span className="text-xs text-[#667085]">Mandate technicians to upload at least one image of the resolved equipment.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleChange('photoProof', !settings.photoProof)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  settings.photoProof ? 'bg-[#12B76A]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.photoProof ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#ABE5C6] hover:bg-[#F6FEF9] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Zap className="w-4 h-4 text-[#667085] group-hover:text-[#12B76A]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#027A48]">Offline Mode & Auto-Sync</span>
                  <span className="text-xs text-[#667085]">Allow technicians to update tickets without internet; sync automatically when online.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleChange('offlineMode', !settings.offlineMode)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  settings.offlineMode ? 'bg-[#12B76A]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.offlineMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>

        {/* Integrations & Alerts */}
        <div className="bg-white rounded-2xl p-8 border border-[#E4E7EC] shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#E4E7EC]">
            <div className="w-10 h-10 rounded-xl bg-[#F4F3FF] text-[#6941C6] flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#172033]">Integrations & Alerts</h3>
              <p className="text-xs text-[#667085] mt-0.5">Connect external platforms and configure automated messaging.</p>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#D6BBFB] hover:bg-[#FAF5FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-[#667085] group-hover:text-[#6941C6]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#53389E]">Email Coordinator Alerts</span>
                  <span className="text-xs text-[#667085]">Receive immediate email notifications on unassigned critical tickets.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleChange('emailAlerts', !settings.emailAlerts)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  settings.emailAlerts ? 'bg-[#6941C6]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.emailAlerts ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#D6BBFB] hover:bg-[#FAF5FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Smartphone className="w-4 h-4 text-[#667085] group-hover:text-[#6941C6]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#53389E]">SMS Dispatch to On-Call Techs</span>
                  <span className="text-xs text-[#667085]">Send automated SMS alerts to technicians when assigned to urgent tickets.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleChange('criticalSms', !settings.criticalSms)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  settings.criticalSms ? 'bg-[#6941C6]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.criticalSms ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>

          <div>
             <label className="block text-xs font-bold text-[#344054] mb-1.5">Enterprise CRM Webhook URL (Salesforce/ServiceNow)</label>
              <input
                type="url"
                placeholder="https://api.crm.example.com/webhook/receive"
                className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#6941C6] transition-colors placeholder:text-[#98A2B3]"
              />
              <p className="text-[10px] text-[#667085] mt-1.5 font-medium">Leave blank to disable CRM bi-directional sync.</p>
          </div>
        </div>
        </div>
        )}

        {/* Navigation & Modules Configuration */}
        {activeTab === 'modules' && (
        <div className="bg-white rounded-2xl p-8 border border-[#E4E7EC] shadow-sm animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#E4E7EC]">
            <div className="w-10 h-10 rounded-xl bg-[#F0F9FF] text-[#0284C7] flex items-center justify-center">
              <Layout className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#172033]">Navigation & Optional Modules</h3>
              <p className="text-xs text-[#667085] mt-0.5">Toggle visibility of specific dashboard features in the sidebar menu.</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Core Modules */}
            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Approvals &amp; Alerts</span>
                  <span className="text-xs text-[#667085]">Enable the password reset approval queue and new request alerts.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, approvals: !prev.approvals }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.approvals ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.approvals ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Ticket className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Service Requests</span>
                  <span className="text-xs text-[#667085]">Enable ticketing and service request management.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, requests: !prev.requests }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.requests ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.requests ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Customer Database</span>
                  <span className="text-xs text-[#667085]">Enable customer accounts and relationship management.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, customers: !prev.customers }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.customers ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.customers ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Tv className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Rooms & Equipment</span>
                  <span className="text-xs text-[#667085]">Enable tracking of physical assets and room setups.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, rooms: !prev.rooms }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.rooms ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.rooms ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Wrench className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Technicians</span>
                  <span className="text-xs text-[#667085]">Enable technician roster and skill management.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, technicians: !prev.technicians }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.technicians ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.technicians ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Onsite Installations Module</span>
                  <span className="text-xs text-[#667085]">Enable tracking for new equipment installations (hides from sidebar if off).</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, installations: !prev.installations }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.installations ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.installations ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Spare Parts Stock Module</span>
                  <span className="text-xs text-[#667085]">Enable inventory management for field technicians.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, inventory: !prev.inventory }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.inventory ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.inventory ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Demo Management Module</span>
                  <span className="text-xs text-[#667085]">Enable scheduling and tracking for client equipment demos.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, demos: !prev.demos }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.demos ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.demos ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Service Calendar</span>
                  <span className="text-xs text-[#667085]">Enable visual calendar and dispatch scheduling.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, calendar: !prev.calendar }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.calendar ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.calendar ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <History className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Service History</span>
                  <span className="text-xs text-[#667085]">Enable historical log of completed service requests.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, history: !prev.history }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.history ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.history ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl border border-[#E4E7EC] hover:border-[#BAE6FD] hover:bg-[#F0F9FF] transition-colors cursor-pointer group">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-4 h-4 text-[#667085] group-hover:text-[#0284C7]" />
                <div>
                  <span className="font-bold text-[#172033] block text-sm group-hover:text-[#0369A1]">Reports</span>
                  <span className="text-xs text-[#667085]">Enable analytics and performance reporting dashboard.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabledModules(prev => ({ ...prev, reports: !prev.reports }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  enabledModules.reports ? 'bg-[#0284C7]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabledModules.reports ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
        )}

        {/* Save Button */}
        <div className="pt-2 flex items-center justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="h-12 px-8 bg-[#004898] hover:bg-[#00346E] text-white rounded-xl flex items-center gap-2 transition-all font-black text-sm shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving…' : 'Save Configuration Settings'}</span>
          </button>
        </div>
      </form>
        </div>
      </div>
    </div>
  );
};
