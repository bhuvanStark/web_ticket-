import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { BarChart3, TrendingUp, Clock, Star, AlertTriangle, Download, FileSpreadsheet, MapPin, CheckCircle2, TrendingDown, ChevronDown, FileText, FileJson } from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';
import { exportFullAnalyticsCSV } from '../../utils/exportUtils';

export const ReportsPage = () => {
  const { reportsData, tickets, customers, installations, simulatedLoading, showToast } = useApp();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (simulatedLoading) return <TableSkeleton rows={5} />;

  const r = reportsData;

  const handleExportFullData = () => {
    exportFullAnalyticsCSV({ reportsData: r, tickets, customers, installations });
    showToast('Exported complete operational analytics & 100% full CSV dataset!', 'success');
  };

  const handleExportPDF = () => {
    exportFullAnalyticsCSV({ reportsData: r, tickets, customers, installations });
    showToast('Preparing PDF Executive Summary & auto-downloading full dataset...', 'info');
    setTimeout(() => {
      window.print();
    }, 600);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-[#172033] tracking-tight">Reports & Analytics</h2>
          <p className="text-sm text-[#667085] mt-1.5 max-w-xl leading-relaxed">
            Operational service performance metrics, SLA compliance, issue distribution, and technician efficiency.
          </p>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsExportOpen(!isExportOpen)}
            className="h-11 px-6 bg-white border border-[#E4E7EC] hover:border-[#B3D1F2] hover:bg-[#F8FAFC] text-[#004898] rounded-full flex items-center gap-2 transition-all font-bold text-sm shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
            <ChevronDown className="w-4 h-4 text-[#172033] ml-1" />
          </button>

          {isExportOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-[#E4E7EC] overflow-hidden z-20 animate-in fade-in slide-in-from-top-2 duration-200 py-2">
              <button
                onClick={() => {
                  handleExportPDF();
                  setIsExportOpen(false);
                }}
                className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
              >
                <FileText className="w-5 h-5 text-[#E3342F]" />
                Export as PDF
              </button>
              <button
                onClick={() => {
                  handleExportFullData();
                  setIsExportOpen(false);
                }}
                className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5 text-[#107C41]" />
                Export as Excel
              </button>
              <button
                onClick={() => {
                  showToast('Exporting Analytics to CSV...', 'info');
                  setIsExportOpen(false);
                }}
                className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
              >
                <FileJson className="w-5 h-5 text-[#475467]" />
                Export as CSV
              </button>
              <button
                onClick={() => {
                  showToast('Exporting Analytics to DOC...', 'info');
                  setIsExportOpen(false);
                }}
                className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
              >
                <FileText className="w-5 h-5 text-[#2B579A]" />
                Export as DOC
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Premium KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total Volume */}
        <div className="bg-white rounded-2xl p-6 border border-[#E4E7EC] shadow-sm relative overflow-hidden group hover:border-[#004898] transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <BarChart3 className="w-16 h-16 text-[#004898]" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-[#667085] mb-4">
              <span className="w-8 h-8 rounded-full bg-[#EFF5FC] flex items-center justify-center text-[#004898]">
                <BarChart3 className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest">Total Volume</span>
            </div>
            <div className="text-4xl font-black text-[#172033] tracking-tight">{r.totalRequests}</div>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs font-bold text-[#D92D20] bg-[#FEF3F2] px-2 py-0.5 rounded-md">{r.openRequests} Open</span>
              <span className="text-xs font-bold text-[#059669] bg-[#ECFDF5] px-2 py-0.5 rounded-md">{r.resolvedRequests} Resolved</span>
            </div>
          </div>
        </div>

        {/* Avg Resolution */}
        <div className="bg-white rounded-2xl p-6 border border-[#E4E7EC] shadow-sm relative overflow-hidden group hover:border-[#0284C7] transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <Clock className="w-16 h-16 text-[#0284C7]" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-[#667085] mb-4">
              <span className="w-8 h-8 rounded-full bg-[#F0F9FF] flex items-center justify-center text-[#0284C7]">
                <Clock className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest">Avg Resolution</span>
            </div>
            <div className="text-4xl font-black text-[#172033] tracking-tight">{r.avgResolutionHours} <span className="text-xl text-[#667085] font-bold">hrs</span></div>
            <div className="flex items-center gap-1.5 mt-3 text-xs font-bold text-[#059669]">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>15% faster than last month</span>
            </div>
          </div>
        </div>

        {/* CSAT Score */}
        <div className="bg-white rounded-2xl p-6 border border-[#E4E7EC] shadow-sm relative overflow-hidden group hover:border-[#F59E0B] transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <Star className="w-16 h-16 text-[#F59E0B]" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-[#667085] mb-4">
              <span className="w-8 h-8 rounded-full bg-[#FFFBEB] flex items-center justify-center text-[#F59E0B]">
                <Star className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest">CSAT Score</span>
            </div>
            <div className="text-4xl font-black text-[#172033] tracking-tight">
              {r.customerSatisfaction} <span className="text-xl text-[#667085] font-bold">/ 5.0</span>
            </div>
            <div className="mt-3 text-xs font-bold text-[#667085]">
              Based on 52 verified customer reviews
            </div>
          </div>
        </div>

        {/* Repeat Issues */}
        <div className="bg-white rounded-2xl p-6 border border-[#E4E7EC] shadow-sm relative overflow-hidden group hover:border-[#059669] transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <AlertTriangle className="w-16 h-16 text-[#059669]" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-[#667085] mb-4">
              <span className="w-8 h-8 rounded-full bg-[#ECFDF5] flex items-center justify-center text-[#059669]">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest">Repeat Issues</span>
            </div>
            <div className="text-4xl font-black text-[#172033] tracking-tight">
              {r.repeatIssueRate}
            </div>
            <div className="flex items-center gap-1.5 mt-3 text-xs font-bold text-[#059669]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>World-class reliability benchmark</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts / Data Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Issue Type Distribution */}
        <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-base font-black text-[#172033]">Requests by Issue Type</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] bg-[#F8FAFC] px-2 py-1 rounded">This Month</span>
          </div>

          <div className="space-y-6">
            {r.issueTypeBreakdown.map((item, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between text-sm font-bold">
                  <span className="text-[#172033]">{item.label}</span>
                  <div className="text-right">
                    <span className="text-[#172033]">{item.value}</span>
                    <span className="text-[#667085] ml-1 font-medium">({item.percentage})</span>
                  </div>
                </div>
                <div className="w-full h-2.5 bg-[#F8FAFC] rounded-full overflow-hidden border border-[#E4E7EC]">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: item.percentage, backgroundColor: item.color }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Requests by Location */}
        <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm p-8">
          <h3 className="text-base font-black text-[#172033] mb-8">Requests by Location</h3>

          <div className="space-y-2">
            {r.locationBreakdown.map((loc, idx) => (
              <div key={idx} className="group p-4 rounded-xl hover:bg-[#F8FAFC] transition-colors flex items-center justify-between cursor-default border border-transparent hover:border-[#E4E7EC]">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#EFF5FC] text-[#004898] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-[#172033] text-sm">{loc.label}</h4>
                    <p className="text-[#667085] text-xs font-medium mt-0.5">{loc.count} Total Tickets Logged</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-[#004898]">
                    {loc.percentage}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Technician Performance Leaderboard */}
      <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-[#E4E7EC] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-b from-[#F8FAFC] to-white">
          <div>
            <h3 className="text-base font-black text-[#172033]">Technician Performance Leaderboard</h3>
            <span className="text-xs font-medium text-[#667085] mt-1 block">Ranked by resolution SLA & CSAT ratings</span>
          </div>
          <button
            onClick={handleExportFullData}
            className="text-xs font-bold text-[#004898] hover:text-[#00346E] flex items-center gap-1.5 bg-[#EFF5FC] hover:bg-[#E3EFFB] px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-white border-b border-[#E4E7EC]">
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-wider text-[#667085]">Rank & Technician</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-wider text-[#667085]">Jobs Resolved</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-wider text-[#667085]">Avg SLA Time</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-wider text-[#667085]">CSAT Rating</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-wider text-[#667085] text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {r.techPerformance.map((tech, idx) => (
                <tr key={idx} className="hover:bg-[#F8FAFC] transition-colors group">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black
                        ${idx === 0 ? 'bg-[#FFFBEB] text-[#B54708]' : 
                          idx === 1 ? 'bg-[#F3F4F6] text-[#374151]' : 
                          idx === 2 ? 'bg-[#FEF3F2] text-[#912018]' : 
                          'bg-[#EFF5FC] text-[#004898]'}`}
                      >
                        #{idx + 1}
                      </span>
                      <span className="font-extrabold text-[#172033] text-sm">{tech.name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className="font-black text-[#172033] text-sm">{tech.jobs}</span>
                    <span className="text-xs text-[#667085] ml-1 font-medium">Tickets</span>
                  </td>
                  <td className="py-4 px-6 text-sm font-bold text-[#475467]">
                    {tech.time}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-[#F79009]">
                      <Star className="w-4 h-4 fill-[#F79009]" />
                      <span>{tech.rating}</span>
                      <span className="text-xs text-[#667085] font-medium">/ 5.0</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <span className="inline-flex items-center justify-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-[#ECFDF5] text-[#059669] border border-[#ABE5C6]">
                      Top Performer
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
