import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Package, 
  Plus, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  Warehouse, 
  GitFork, 
  UserCheck, 
  HardDrive, 
  Cpu, 
  Zap, 
  Clock, 
  X, 
  Send, 
  Check,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Building2,
  Tag
} from 'lucide-react';

const INITIAL_INVENTORY = [
  { id: 'SKU-LOG-01', name: 'Logitech Rally Bar Ultra-HD System', category: 'Video Conferencing', warehouse: 'Bengaluru Hub', stock: 14, minThreshold: 5, unitCost: '₹2,45,000', status: 'In Stock' },
  { id: 'SKU-CRE-02', name: 'Crestron TS-1070-B-S 10.1 Touch Screen', category: 'Room Control', warehouse: 'Bengaluru Hub', stock: 8, minThreshold: 3, unitCost: '₹98,000', status: 'In Stock' },
  { id: 'SKU-BIA-03', name: 'Biamp TesiraFORTÉ DAN AI DSP Engine', category: 'Audio System', warehouse: 'Chennai Warehouse', stock: 3, minThreshold: 4, unitCost: '₹1,85,000', status: 'Low Stock' },
  { id: 'SKU-EXT-04', name: 'Extron DTP CrossPoint 108 4K Switcher', category: 'Connectivity', warehouse: 'Hyderabad Hub', stock: 2, minThreshold: 3, unitCost: '₹2,10,000', status: 'Low Stock' },
  { id: 'SKU-SHU-05', name: 'Sennheiser / Shure Ceiling Array Mic', category: 'Microphones', warehouse: 'Bengaluru Hub', stock: 12, minThreshold: 4, unitCost: '₹1,40,000', status: 'In Stock' },
  { id: 'SKU-ABS-06', name: 'Absen 138" All-in-One MicroLED Cabinet', category: 'Display', warehouse: 'Mumbai Warehouse', stock: 6, minThreshold: 2, unitCost: '₹8,50,000', status: 'In Stock' },
  { id: 'SKU-BAR-07', name: 'Barco ClickShare CX-30 Gen2 Button', category: 'Wireless Sharing', warehouse: 'Chennai Warehouse', stock: 28, minThreshold: 10, unitCost: '₹45,000', status: 'In Stock' }
];

const CONSULTANTS = [
  {
    id: 'CNS-01',
    name: 'Deepak Sharma',
    title: 'Memory & Compute Consultant',
    specialty: 'RAM Modules, SSDs, In-Store Hardware',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    category: 'RAM & Memory'
  },
  {
    id: 'CNS-02',
    name: 'Anand Verma',
    title: 'Senior AV Hardware Consultant',
    specialty: 'DSP Engines, Matrix Switchers',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    category: 'Core Hardware'
  },
  {
    id: 'CNS-03',
    name: 'Priya Patel',
    title: 'In-Store Peripherals Consultant',
    specialty: 'Touch Panels, In-Store Items',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    category: 'In-Store Item'
  },
  {
    id: 'CNS-04',
    name: 'Suresh Menon',
    title: 'Cabling & Power Consultant',
    specialty: 'PoE Extenders, Power Supplies',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    category: 'Cabling & Power'
  }
];

const WARRANTY_VENDORS = [
  {
    id: 'VND-LOG',
    companyName: 'Logitech India OEM Support Desk',
    consultantId: 'CNS-02',
    consultantName: 'Anand Verma',
    consultantTitle: 'Logitech OEM Lead',
    warrantyCoverage: 'Hardware (3 Yr) & Firmware Support'
  },
  {
    id: 'VND-CRE',
    companyName: 'Crestron Electronics Global RMA',
    consultantId: 'CNS-03',
    consultantName: 'Priya Patel',
    consultantTitle: 'Crestron Master Specialist',
    warrantyCoverage: 'Control Hardware & XiO Cloud License'
  },
  {
    id: 'VND-BIA',
    companyName: 'Biamp Systems Technical Warranty Desk',
    consultantId: 'CNS-01',
    consultantName: 'Deepak Sharma',
    consultantTitle: 'Biamp DSP & License Specialist',
    warrantyCoverage: 'Tesira Hardware & Dante License Warranty'
  },
  {
    id: 'VND-EXT',
    companyName: 'Extron Electronics RMA Division',
    consultantId: 'CNS-04',
    consultantName: 'Suresh Menon',
    consultantTitle: 'Extron Field Warranty Lead',
    warrantyCoverage: '3-Year Advanced Hardware Replacement'
  }
];

const INITIAL_ROUTED_REQUESTS = [
  {
    id: 'SPR-9041',
    partName: '32GB DDR4 ECC Server RAM Module',
    category: 'RAM & Memory',
    qty: 2,
    ticketId: 'TT-10482',
    customerName: 'ABC Technologies',
    roomName: 'Boardroom',
    requestedBy: 'Ravi Kumar',
    consultantId: 'CNS-01',
    consultantName: 'Deepak Sharma',
    consultantTitle: 'Memory Consultant',
    urgency: 'Urgent',
    status: 'Pending Consultant Review',
    notes: 'RAM upgrade required after Logitech Rally compute lag.'
  },
  {
    id: 'SPR-9042',
    partName: 'Crestron 10.1" Touch Panel Glass Assembly',
    category: 'In-Store Item',
    qty: 1,
    ticketId: 'TT-10483',
    customerName: 'Wipro Digital Hub',
    roomName: 'Conference Room 4B',
    requestedBy: 'Amit Patel',
    consultantId: 'CNS-03',
    consultantName: 'Priya Patel',
    consultantTitle: 'In-Store Consultant',
    urgency: 'Normal',
    status: 'Approved & Dispatched',
    notes: 'Cracked capacitive touch glass panel during relocation.'
  },
  {
    id: 'SPR-9043',
    partName: 'Biamp TesiraFORTÉ DAN DSP Expansion Board',
    category: 'Core Hardware',
    qty: 1,
    ticketId: 'TT-10484',
    customerName: 'Infosys Innovation Lab',
    roomName: 'Auditorium A',
    requestedBy: 'Ravi Kumar',
    consultantId: 'CNS-02',
    consultantName: 'Anand Verma',
    consultantTitle: 'Hardware Consultant',
    urgency: 'High',
    status: 'Pending Consultant Review',
    notes: 'Dante AI expansion card required for multi-mic array.'
  },
  {
    id: 'SPR-9044',
    partName: 'Extron 4K HDMI Extender Pair & Power Supply',
    category: 'Cabling & Power',
    qty: 2,
    ticketId: 'TT-10485',
    customerName: 'TCS Cyber Park',
    roomName: 'Executive Suite',
    requestedBy: 'Suresh Kumar',
    consultantId: 'CNS-04',
    consultantName: 'Suresh Menon',
    consultantTitle: 'Cabling & Power Consultant',
    urgency: 'Normal',
    status: 'In Transit',
    notes: 'Power supply unit failed after electrical surge.'
  }
];

const INITIAL_RMA_REQUESTS = [
  {
    id: 'RMA-8041',
    equipmentName: 'Logitech Rally Bar Ultra-HD System',
    serialNo: 'SN-LOG-994821-IN',
    warrantyType: 'Hardware Warranty',
    vendorId: 'VND-LOG',
    companyName: 'Logitech India OEM Support Desk',
    consultantName: 'Anand Verma',
    consultantTitle: 'Logitech OEM Lead',
    ticketId: 'TT-10482',
    customerName: 'ABC Technologies',
    status: 'Vendor Approved',
    filedDate: '20 Aug 2026',
    notes: 'Optical 4K lens sensor defect under 3-Year OEM Hardware Warranty. Replacement camera unit approved by Logitech.'
  },
  {
    id: 'RMA-8042',
    equipmentName: 'Biamp TesiraFORTÉ Software License Key',
    serialNo: 'LIC-BIA-88391-X',
    warrantyType: 'Software License / Firmware',
    vendorId: 'VND-BIA',
    companyName: 'Biamp Systems Technical Warranty Desk',
    consultantName: 'Deepak Sharma',
    consultantTitle: 'Biamp DSP & License Specialist',
    ticketId: 'TT-10484',
    customerName: 'Infosys Innovation Lab',
    status: 'Warranty Claim Filed',
    filedDate: '21 Aug 2026',
    notes: 'Dante AI 32-channel software license key activation error after v4.2 firmware upgrade.'
  },
  {
    id: 'RMA-8043',
    equipmentName: 'Crestron TS-1070-B-S 10.1 Touch Screen',
    serialNo: 'SN-CRE-77102-IN',
    warrantyType: 'Hardware Warranty',
    vendorId: 'VND-CRE',
    companyName: 'Crestron Electronics Global RMA',
    consultantName: 'Priya Patel',
    consultantTitle: 'Crestron Master Specialist',
    ticketId: 'TT-10483',
    customerName: 'Wipro Digital Hub',
    status: 'Replacement Dispatched',
    filedDate: '19 Aug 2026',
    notes: 'Internal power IC failure covered under Crestron Extended Warranty. Replacement unit in transit.'
  }
];

export const InventoryPage = () => {
  const { showToast, tickets } = useApp();
  
  // Active View Switcher: 'routing' (Part Requests) | 'rma' (RMA & Warranty) | 'inventory' (Stock Inventory)
  const [activeTab, setActiveTab] = useState('routing');

  // Inventory State
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [stockSearch, setStockSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('All');
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [newStockItem, setNewStockItem] = useState({ name: '', category: 'Video Conferencing', warehouse: 'Bengaluru Hub', stock: 10, minThreshold: 3, unitCost: '₹50,000' });

  // Part Requests Routing State
  const [routedRequests, setRoutedRequests] = useState(INITIAL_ROUTED_REQUESTS);
  const [routingSearch, setRoutingSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [consultantFilter, setConsultantFilter] = useState('All');
  const [showRouteModal, setShowRouteModal] = useState(false);

  // RMA & Warranty Routing State
  const [rmaRequests, setRmaRequests] = useState(INITIAL_RMA_REQUESTS);
  const [rmaSearch, setRmaSearch] = useState('');
  const [rmaTypeFilter, setRmaTypeFilter] = useState('All');
  const [showRmaModal, setShowRmaModal] = useState(false);

  // New Part Request Form State
  const [newRequest, setNewRequest] = useState({
    partName: '',
    category: 'RAM & Memory',
    qty: 1,
    ticketId: 'TT-10482',
    consultantId: 'CNS-01',
    urgency: 'Normal',
    notes: ''
  });

  // New RMA Claim Form State
  const [newRma, setNewRma] = useState({
    equipmentName: '',
    serialNo: '',
    warrantyType: 'Hardware Warranty',
    vendorId: 'VND-LOG',
    ticketId: 'TT-10482',
    notes: ''
  });

  // Part Category Auto-Selection for Consultant
  const handleCategorySelect = (cat) => {
    let matchedConsultant = CONSULTANTS[0];
    if (cat === 'RAM & Memory') matchedConsultant = CONSULTANTS.find(c => c.id === 'CNS-01') || CONSULTANTS[0];
    else if (cat === 'Core Hardware') matchedConsultant = CONSULTANTS.find(c => c.id === 'CNS-02') || CONSULTANTS[0];
    else if (cat === 'In-Store Item') matchedConsultant = CONSULTANTS.find(c => c.id === 'CNS-03') || CONSULTANTS[0];
    else if (cat === 'Cabling & Power') matchedConsultant = CONSULTANTS.find(c => c.id === 'CNS-04') || CONSULTANTS[0];

    setNewRequest(prev => ({
      ...prev,
      category: cat,
      consultantId: matchedConsultant.id
    }));
  };

  const handleCreateRequest = (e) => {
    e.preventDefault();
    const assignedC = CONSULTANTS.find(c => c.id === newRequest.consultantId) || CONSULTANTS[0];
    const linkedT = (tickets || []).find(t => t.id === newRequest.ticketId) || { id: newRequest.ticketId, customer: 'ABC Technologies', room: 'Boardroom' };

    const newObj = {
      id: `SPR-${Math.floor(9000 + Math.random() * 999)}`,
      partName: newRequest.partName,
      category: newRequest.category,
      qty: Number(newRequest.qty),
      ticketId: linkedT.id || 'TT-10482',
      customerName: linkedT.customer || 'ABC Technologies',
      roomName: linkedT.room || 'Boardroom',
      requestedBy: 'Service Coordinator',
      consultantId: assignedC.id,
      consultantName: assignedC.name,
      consultantTitle: assignedC.title,
      urgency: newRequest.urgency,
      status: 'Pending Consultant Review',
      notes: newRequest.notes || 'Spare part request routed directly.'
    };

    setRoutedRequests([newObj, ...routedRequests]);
    setShowRouteModal(false);
    setNewRequest({
      partName: '',
      category: 'RAM & Memory',
      qty: 1,
      ticketId: 'TT-10482',
      consultantId: 'CNS-01',
      urgency: 'Normal',
      notes: ''
    });

    if (showToast) {
      showToast(`Request ${newObj.id} routed directly to Consultant ${assignedC.name}!`, 'success');
    }
  };

  // Submit RMA Warranty Claim
  const handleCreateRmaClaim = (e) => {
    e.preventDefault();
    const vendor = WARRANTY_VENDORS.find(v => v.id === newRma.vendorId) || WARRANTY_VENDORS[0];
    const linkedT = (tickets || []).find(t => t.id === newRma.ticketId) || { id: newRma.ticketId, customer: 'ABC Technologies' };

    const createdRma = {
      id: `RMA-${Math.floor(8000 + Math.random() * 999)}`,
      equipmentName: newRma.equipmentName,
      serialNo: newRma.serialNo || `SN-AV-${Math.floor(10000 + Math.random() * 90000)}`,
      warrantyType: newRma.warrantyType,
      vendorId: vendor.id,
      companyName: vendor.companyName,
      consultantName: vendor.consultantName,
      consultantTitle: vendor.consultantTitle,
      ticketId: linkedT.id || 'TT-10482',
      customerName: linkedT.customer || 'ABC Technologies',
      status: 'Warranty Claim Filed',
      filedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      notes: newRma.notes || 'Warranty RMA request routed directly to OEM company.'
    };

    setRmaRequests([createdRma, ...rmaRequests]);
    setShowRmaModal(false);
    setNewRma({
      equipmentName: '',
      serialNo: '',
      warrantyType: 'Hardware Warranty',
      vendorId: 'VND-LOG',
      ticketId: 'TT-10482',
      notes: ''
    });

    if (showToast) {
      showToast(`RMA Claim ${createdRma.id} routed directly to ${vendor.companyName}!`, 'success');
    }
  };

  const handleReRouteConsultant = (reqId, newCId) => {
    const targetC = CONSULTANTS.find(c => c.id === newCId);
    if (!targetC) return;

    setRoutedRequests(prev => prev.map(r => {
      if (r.id === reqId) {
        return {
          ...r,
          consultantId: targetC.id,
          consultantName: targetC.name,
          consultantTitle: targetC.title,
          status: 'Pending Consultant Review'
        };
      }
      return r;
    }));

    if (showToast) {
      showToast(`Request ${reqId} re-routed to Consultant ${targetC.name}!`, 'info');
    }
  };

  const handleApproveRequest = (reqId) => {
    setRoutedRequests(prev => prev.map(r => {
      if (r.id === reqId) return { ...r, status: 'Approved & Dispatched' };
      return r;
    }));
    if (showToast) showToast(`Request ${reqId} approved & dispatched!`, 'success');
  };

  // Update RMA Status
  const handleUpdateRmaStatus = (rmaId, newStatus) => {
    setRmaRequests(prev => prev.map(r => {
      if (r.id === rmaId) return { ...r, status: newStatus };
      return r;
    }));
    if (showToast) showToast(`RMA Claim ${rmaId} updated to "${newStatus}"!`, 'success');
  };

  // Adjust Stock Item Qty
  const handleAdjustStock = (id, delta) => {
    setInventory(inventory.map(item => {
      if (item.id === id) {
        const newStock = Math.max(0, item.stock + delta);
        return {
          ...item,
          stock: newStock,
          status: newStock <= item.minThreshold ? 'Low Stock' : 'In Stock'
        };
      }
      return item;
    }));
  };

  const handleAddStock = (e) => {
    e.preventDefault();
    const itemToAdd = {
      ...newStockItem,
      id: `SKU-AV-${Math.floor(10 + Math.random() * 90)}`,
      stock: Number(newStockItem.stock),
      minThreshold: Number(newStockItem.minThreshold),
      status: Number(newStockItem.stock) <= Number(newStockItem.minThreshold) ? 'Low Stock' : 'In Stock'
    };
    setInventory([itemToAdd, ...inventory]);
    setShowAddStockModal(false);
    setNewStockItem({ name: '', category: 'Video Conferencing', warehouse: 'Bengaluru Hub', stock: 10, minThreshold: 3, unitCost: '₹50,000' });
    if (showToast) showToast(`Added SKU ${itemToAdd.id}!`, 'success');
  };

  // Filtered Lists
  const filteredRequests = routedRequests.filter(r => {
    const q = routingSearch.toLowerCase();
    const matchQ = (r.partName || '').toLowerCase().includes(q) ||
                   (r.id || '').toLowerCase().includes(q) ||
                   (r.ticketId || '').toLowerCase().includes(q) ||
                   (r.consultantName || '').toLowerCase().includes(q);

    const matchCat = categoryFilter === 'All' || r.category === categoryFilter;
    const matchConsultant = consultantFilter === 'All' || r.consultantId === consultantFilter;

    return matchQ && matchCat && matchConsultant;
  });

  const filteredRma = rmaRequests.filter(r => {
    const q = rmaSearch.toLowerCase();
    const matchQ = (r.equipmentName || '').toLowerCase().includes(q) ||
                   (r.id || '').toLowerCase().includes(q) ||
                   (r.serialNo || '').toLowerCase().includes(q) ||
                   (r.companyName || '').toLowerCase().includes(q);

    const matchType = rmaTypeFilter === 'All' || r.warrantyType === rmaTypeFilter;

    return matchQ && matchType;
  });

  const filteredInventory = inventory.filter(item => {
    const matchQ = item.name.toLowerCase().includes(stockSearch.toLowerCase()) || item.id.toLowerCase().includes(stockSearch.toLowerCase());
    const matchW = selectedWarehouse === 'All' || item.warehouse === selectedWarehouse;
    return matchQ && matchW;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* CLEAN HEADER & VIEW TOGGLE */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E4E7EC] pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">Spare Parts & RMA Warranty Routing</h1>
          <p className="text-xs md:text-sm text-[#667085] mt-1">
            Manage spare part requests, hardware & software warranty RMA claims, and warehouse stock levels.
          </p>
        </div>

        {/* Action Button & Segmented View Pills */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-[#F1F5F9] p-1.5 rounded-xl flex items-center border border-[#E2E8F0] shadow-2xs">
            <button
              onClick={() => setActiveTab('routing')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'routing'
                  ? 'bg-white text-[#004898] shadow-xs border border-[#B3D1F2]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>Part Requests</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#EFF5FC] text-[#004898] font-black border border-[#B3D1F2]">
                {routedRequests.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('rma')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'rma'
                  ? 'bg-white text-[#004898] shadow-xs border border-[#B3D1F2]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
              <span>RMA & Warranty</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#ECFDF5] text-[#047857] font-black border border-[#A7F3D0]">
                {rmaRequests.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-white text-[#004898] shadow-xs border border-[#B3D1F2]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Stock Inventory</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#F1F5F9] text-[#475569] font-black border border-[#CBD5E1]">
                {inventory.length}
              </span>
            </button>
          </div>

          {activeTab === 'routing' && (
            <button
              onClick={() => setShowRouteModal(true)}
              className="btn btn-primary text-xs font-bold shadow-xs py-2 px-4 rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <GitFork className="w-4 h-4 text-[#38BDF8]" />
              <span>+ Request Spare Part</span>
            </button>
          )}

          {activeTab === 'rma' && (
            <button
              onClick={() => setShowRmaModal(true)}
              className="btn bg-[#10B981] hover:bg-[#059669] text-white font-bold text-xs shadow-xs py-2 px-4 rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-white" />
              <span>+ Create RMA Claim</span>
            </button>
          )}

          {activeTab === 'inventory' && (
            <button
              onClick={() => setShowAddStockModal(true)}
              className="btn btn-primary text-xs font-bold shadow-xs py-2 px-4 rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Stock SKU</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: SPARE PARTS REQUEST ROUTING */}
      {/* ========================================================================= */}
      {activeTab === 'routing' && (
        <div className="space-y-6">
          {/* Summary Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs flex items-center justify-between hover:border-[#004898] transition-all">
              <div>
                <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Part Requests</div>
                <div className="text-2xl font-black text-[#0F172A] mt-1">{routedRequests.length} <span className="text-xs font-bold text-[#64748B]">Routed</span></div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-[#EFF5FC] text-[#004898] flex items-center justify-center border border-[#B3D1F2] shadow-2xs">
                <GitFork className="w-5 h-5" />
              </div>
            </div>

            <div className="p-5 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs flex items-center justify-between hover:border-[#F59E0B] transition-all">
              <div>
                <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Pending Review</div>
                <div className="text-2xl font-black text-[#B54708] mt-1">
                  {routedRequests.filter(r => r.status.includes('Pending')).length} <span className="text-xs font-bold text-[#B54708]">Awaiting Sign-Off</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-[#FFFBEB] text-[#D97706] flex items-center justify-center border border-[#FDE68A] shadow-2xs">
                <Clock className="w-5 h-5 animate-pulse" />
              </div>
            </div>

            <div className="p-5 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs flex items-center justify-between hover:border-[#10B981] transition-all">
              <div>
                <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Dispatched & Active</div>
                <div className="text-2xl font-black text-[#047857] mt-1">
                  {routedRequests.filter(r => !r.status.includes('Pending')).length} <span className="text-xs font-bold text-[#047857]">In Field / Active</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-[#ECFDF5] text-[#10B981] flex items-center justify-center border border-[#A7F3D0] shadow-2xs">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Clean Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none z-10" />
              <input
                type="text"
                value={routingSearch}
                onChange={(e) => setRoutingSearch(e.target.value)}
                placeholder="Search part name, RAM, ticket #..."
                style={{ paddingLeft: '40px' }}
                className="w-full py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-semibold focus:outline-none focus:border-[#004898] focus:bg-white transition-all"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="py-2 px-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#0F172A] focus:outline-none focus:border-[#004898]"
              >
                <option value="All">All Categories</option>
                <option value="RAM & Memory">RAM & Memory</option>
                <option value="In-Store Item">In-Store Items</option>
                <option value="Core Hardware">Core Hardware</option>
                <option value="Cabling & Power">Cabling & Power</option>
              </select>

              <select
                value={consultantFilter}
                onChange={(e) => setConsultantFilter(e.target.value)}
                className="py-2 px-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#0F172A] focus:outline-none focus:border-[#004898]"
              >
                <option value="All">All Consultants</option>
                {CONSULTANTS.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Requests Table */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                  <th className="py-3.5 px-5">Request #</th>
                  <th className="py-3.5 px-5">Part / Component</th>
                  <th className="py-3.5 px-5">Category</th>
                  <th className="py-3.5 px-5">Linked Ticket</th>
                  <th className="py-3.5 px-5">Assigned Consultant</th>
                  <th className="py-3.5 px-5">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-xs">
                {filteredRequests.map(req => {
                  const currentConsultant = CONSULTANTS.find(c => c.id === req.consultantId) || CONSULTANTS[0];
                  return (
                    <tr key={req.id} className="hover:bg-[#F8FAFC] transition-colors">
                      {/* Request # */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        <span className="font-mono font-extrabold text-[#004898] bg-[#F0F5FA] px-2.5 py-1 rounded-lg border border-[#B3D1F2] text-[11px] shadow-2xs">
                          {req.id}
                        </span>
                      </td>

                      {/* Part / Component */}
                      <td className="py-4 px-5">
                        <div className="font-bold text-[#0F172A] text-xs">{req.partName}</div>
                        <div className="text-[11px] text-[#64748B] mt-0.5">
                          Qty: <strong className="text-[#0F172A] font-extrabold">{req.qty} Unit</strong> • Req by {req.requestedBy}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                          req.category === 'RAM & Memory' ? 'bg-[#F0F9FF] text-[#026AA7] border-[#B2DDFF]' :
                          req.category === 'In-Store Item' ? 'bg-[#FDF2FA] text-[#C11574] border-[#FCCEEE]' :
                          req.category === 'Core Hardware' ? 'bg-[#EFF5FC] text-[#004898] border-[#B3D1F2]' :
                          'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]'
                        }`}>
                          {req.category === 'RAM & Memory' && <HardDrive className="w-3.5 h-3.5" />}
                          {req.category === 'In-Store Item' && <Package className="w-3.5 h-3.5" />}
                          {req.category === 'Core Hardware' && <Cpu className="w-3.5 h-3.5" />}
                          {req.category === 'Cabling & Power' && <Zap className="w-3.5 h-3.5" />}
                          <span>{req.category}</span>
                        </span>
                      </td>

                      {/* Linked Ticket */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="font-mono font-extrabold text-[#004898] text-xs">{req.ticketId}</div>
                        <div className="text-[11px] text-[#475569] font-medium mt-0.5">{req.customerName}</div>
                        <div className="text-[10px] text-[#94A3B8]">({req.roomName})</div>
                      </td>

                      {/* Assigned Consultant Dropdown Styling */}
                      <td className="py-4 px-5">
                        <div className="relative inline-block w-full max-w-[240px]">
                          <select
                            value={req.consultantId}
                            onChange={(e) => handleReRouteConsultant(req.id, e.target.value)}
                            className="w-full py-1.5 px-3 pr-8 bg-[#F8FAFC] border border-[#CBD5E1] hover:border-[#004898] rounded-xl text-xs font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#004898]/15 appearance-none cursor-pointer transition-all shadow-2xs"
                          >
                            {CONSULTANTS.map(c => (
                              <option key={c.id} value={c.id}>👤 {c.name} ({c.title})</option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#64748B]">
                            <UserCheck className="w-3.5 h-3.5 text-[#004898]" />
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold border ${
                          req.status.includes('Pending') ? 'bg-[#FFFBEB] text-[#B54708] border-[#FDE68A]' :
                          'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]'
                        }`}>
                          {req.status.includes('Pending') ? <Clock className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          <span>{req.status}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 whitespace-nowrap text-right">
                        {req.status.includes('Pending') ? (
                          <button
                            onClick={() => handleApproveRequest(req.id)}
                            className="px-3.5 py-1.5 bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                            <span>Approve</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] text-xs font-bold">
                            <Check className="w-3.5 h-3.5 text-[#10B981]" />
                            <span>Dispatched</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: RMA & WARRANTY ROUTING (NEW FEATURE) */}
      {/* ========================================================================= */}
      {activeTab === 'rma' && (
        <div className="space-y-5">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white rounded-xl border border-[#E4E7EC] shadow-xs flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-[#667085] uppercase tracking-wider">Total RMA Claims</div>
                <div className="text-xl font-extrabold text-[#172033] mt-0.5">{rmaRequests.length} Claims Filed</div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] text-[#12B76A] flex items-center justify-center border border-[#A7F3D0]">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-[#E4E7EC] shadow-xs flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-[#667085] uppercase tracking-wider">Hardware Warranty</div>
                <div className="text-xl font-extrabold text-[#004898] mt-0.5">
                  {rmaRequests.filter(r => r.warrantyType === 'Hardware Warranty').length} OEM Hardware Claims
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#EFF5FC] text-[#004898] flex items-center justify-center border border-[#B3D1F2]">
                <Cpu className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-[#E4E7EC] shadow-xs flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-[#667085] uppercase tracking-wider">Software / Firmware</div>
                <div className="text-xl font-extrabold text-[#C11574] mt-0.5">
                  {rmaRequests.filter(r => r.warrantyType.includes('Software')).length} License Keys
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#FDF2FA] text-[#C11574] flex items-center justify-center border border-[#FCCEEE]">
                <Tag className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-[#E4E7EC]">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                value={rmaSearch}
                onChange={(e) => setRmaSearch(e.target.value)}
                placeholder="Search RMA #, Equipment, Serial #..."
                className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-semibold focus:outline-none focus:border-[#004898]"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#667085] uppercase">Warranty Type:</span>
              <select
                value={rmaTypeFilter}
                onChange={(e) => setRmaTypeFilter(e.target.value)}
                className="py-1.5 px-3 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
              >
                <option value="All">All Warranty Claims</option>
                <option value="Hardware Warranty">Hardware Warranty</option>
                <option value="Software License / Firmware">Software License / Firmware</option>
              </select>
            </div>
          </div>

          {/* RMA Claims Table */}
          <div className="bg-white rounded-xl border border-[#E4E7EC] overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC] text-xs font-extrabold text-[#475467] uppercase tracking-wider">
                  <th className="py-3 px-4">RMA #</th>
                  <th className="py-3 px-4">Equipment / Serial #</th>
                  <th className="py-3 px-4">Warranty Type</th>
                  <th className="py-3 px-4">OEM Vendor Company & Consultant</th>
                  <th className="py-3 px-4">Linked Ticket</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EC] text-xs">
                {filteredRma.map(rma => (
                  <tr key={rma.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-3.5 px-4 font-mono font-extrabold text-[#047857]">{rma.id}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-[#172033]">{rma.equipmentName}</div>
                      <div className="text-[11px] font-mono text-[#667085]">SN: <strong className="text-[#172033]">{rma.serialNo}</strong></div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-extrabold ${
                        rma.warrantyType === 'Hardware Warranty'
                          ? 'bg-[#EFF5FC] text-[#004898] border border-[#B3D1F2]'
                          : 'bg-[#FDF2FA] text-[#C11574] border border-[#FCCEEE]'
                      }`}>
                        {rma.warrantyType === 'Hardware Warranty' ? <Cpu className="w-3 h-3" /> : <Tag className="w-3 h-3" />}
                        <span>{rma.warrantyType}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-[#172033] flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-[#004898]" />
                        <span>{rma.companyName}</span>
                      </div>
                      <div className="text-[11px] text-[#004898] font-bold">Consultant: {rma.consultantName}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-[#004898]">{rma.ticketId}</div>
                      <div className="text-[11px] text-[#475467]">{rma.customerName}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                        rma.status === 'Vendor Approved' ? 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]' :
                        rma.status === 'Replacement Dispatched' ? 'bg-[#EFF5FC] text-[#004898] border border-[#B3D1F2]' :
                        'bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89]'
                      }`}>
                        {rma.status === 'Vendor Approved' && <CheckCircle className="w-3 h-3" />}
                        {rma.status === 'Warranty Claim Filed' && <Clock className="w-3 h-3" />}
                        <span>{rma.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <select
                        value={rma.status}
                        onChange={(e) => handleUpdateRmaStatus(rma.id, e.target.value)}
                        className="py-1 px-2 bg-[#F8FAFC] border border-[#D0D5DD] rounded-lg text-xs font-bold text-[#047857] focus:outline-none"
                      >
                        <option value="Warranty Claim Filed">Claim Filed</option>
                        <option value="Vendor Approved">Vendor Approved</option>
                        <option value="Replacement Dispatched">Dispatched</option>
                        <option value="Closed / Replaced">Closed / Replaced</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: STOCK INVENTORY */}
      {/* ========================================================================= */}
      {activeTab === 'inventory' && (
        <div className="space-y-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-xl border border-[#E4E7EC] shadow-xs">
              <div className="text-xs font-bold text-[#667085] uppercase">Total SKUs Tracked</div>
              <div className="text-2xl font-extrabold text-[#172033] mt-1">{inventory.length} SKUs</div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-[#E4E7EC] shadow-xs">
              <div className="text-xs font-bold text-[#667085] uppercase">Bengaluru Hub</div>
              <div className="text-2xl font-extrabold text-[#172033] mt-1">
                {inventory.filter(i => i.warehouse === 'Bengaluru Hub').reduce((sum, i) => sum + i.stock, 0)} Units
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-[#E4E7EC] shadow-xs">
              <div className="text-xs font-bold text-[#667085] uppercase">Chennai & Hyderabad</div>
              <div className="text-2xl font-extrabold text-[#172033] mt-1">
                {inventory.filter(i => i.warehouse.includes('Chennai') || i.warehouse.includes('Hyderabad')).reduce((sum, i) => sum + i.stock, 0)} Units
              </div>
            </div>

            <div className="p-4 bg-[#FEF3F2]/50 rounded-xl border border-[#FEF3F2] shadow-xs">
              <div className="text-xs font-bold text-[#B42318] uppercase">Low Stock Alert</div>
              <div className="text-2xl font-extrabold text-[#B42318] mt-1">
                {inventory.filter(i => i.status === 'Low Stock').length} SKUs Need Restock
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-3.5 rounded-xl border border-[#E4E7EC]">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3] pointer-events-none z-10" />
              <input
                type="text"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Search by SKU #, equipment name..."
                style={{ paddingLeft: '40px' }}
                className="w-full pr-3 py-1.5 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-semibold focus:outline-none focus:border-[#004898]"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#667085] uppercase">Warehouse:</span>
              {['All', 'Bengaluru Hub', 'Chennai Warehouse', 'Hyderabad Hub'].map(w => (
                <button
                  key={w}
                  onClick={() => setSelectedWarehouse(w)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    selectedWarehouse === w
                      ? 'bg-[#004898] text-white'
                      : 'bg-[#F2F4F7] text-[#475467] hover:bg-[#E4E7EC]'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Inventory Table */}
          <div className="bg-white rounded-xl border border-[#E4E7EC] overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC] text-xs font-bold text-[#475467] uppercase tracking-wider">
                  <th className="py-3 px-4">SKU ID</th>
                  <th className="py-3 px-4">Equipment Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Warehouse</th>
                  <th className="py-3 px-4">Available Stock</th>
                  <th className="py-3 px-4">Unit Cost</th>
                  <th className="py-3 px-4">Stock Status</th>
                  <th className="py-3 px-4 text-right">Adjust Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EC] text-xs">
                {filteredInventory.map(item => (
                  <tr key={item.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#004898]">{item.id}</td>
                    <td className="py-3.5 px-4 font-bold text-[#172033]">{item.name}</td>
                    <td className="py-3.5 px-4 text-[#667085]">{item.category}</td>
                    <td className="py-3.5 px-4 font-medium text-[#344054]">{item.warehouse}</td>
                    <td className="py-3.5 px-4 font-extrabold text-[#172033]">
                      {item.stock} Units <span className="text-[10px] font-normal text-[#98A2B3]">(Min: {item.minThreshold})</span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[#172033]">{item.unitCost}</td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        item.status === 'Low Stock'
                          ? 'bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]'
                          : 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]'
                      }`}>
                        {item.status === 'Low Stock' ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                        <span>{item.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1 border border-[#E4E7EC] rounded-lg p-0.5">
                        <button
                          onClick={() => handleAdjustStock(item.id, -1)}
                          className="px-2 py-0.5 text-xs font-bold bg-[#F2F4F7] hover:bg-[#E4E7EC] rounded text-[#344054]"
                        >
                          -
                        </button>
                        <button
                          onClick={() => handleAdjustStock(item.id, 1)}
                          className="px-2 py-0.5 text-xs font-bold bg-[#EFF5FC] hover:bg-[#D1E4F9] rounded text-[#004898]"
                        >
                          +
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ROUTE SPARE PART REQUEST TO CONSULTANT */}
      {/* ========================================================================= */}
      {showRouteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-[#E4E7EC] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EFF5FC] text-[#004898] flex items-center justify-center border border-[#B3D1F2]">
                  <GitFork className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold text-[#172033]">Route Spare Part Request</h3>
              </div>
              <button onClick={() => setShowRouteModal(false)} className="text-[#667085] hover:text-[#172033]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-3.5">
              <div>
                <label className="text-xs font-extrabold text-[#172033] block mb-1">Part / Component Name *</label>
                <input
                  type="text"
                  required
                  value={newRequest.partName}
                  onChange={(e) => setNewRequest({ ...newRequest, partName: e.target.value })}
                  placeholder="e.g. 32GB DDR4 RAM, Crestron Touch Glass..."
                  className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-semibold focus:outline-none focus:border-[#004898]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold text-[#172033] block mb-1">Category *</label>
                  <select
                    value={newRequest.category}
                    onChange={(e) => handleCategorySelect(e.target.value)}
                    className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
                  >
                    <option value="RAM & Memory">RAM & Memory</option>
                    <option value="In-Store Item">In-Store Item</option>
                    <option value="Core Hardware">Core Hardware</option>
                    <option value="Cabling & Power">Cabling & Power</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-extrabold text-[#172033] block mb-1">Quantity *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newRequest.qty}
                    onChange={(e) => setNewRequest({ ...newRequest, qty: e.target.value })}
                    className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold text-[#172033] block mb-1">Linked Ticket ID</label>
                  <select
                    value={newRequest.ticketId}
                    onChange={(e) => setNewRequest({ ...newRequest, ticketId: e.target.value })}
                    className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
                  >
                    {(tickets || []).map(t => (
                      <option key={t.id} value={t.id}>{t.id}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-extrabold text-[#172033] block mb-1">Urgency</label>
                  <select
                    value={newRequest.urgency}
                    onChange={(e) => setNewRequest({ ...newRequest, urgency: e.target.value })}
                    className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Consultant Routing Box */}
              <div className="p-3 rounded-lg bg-[#EFF5FC] border border-[#B3D1F2] space-y-1.5">
                <label className="text-xs font-extrabold text-[#004898] block">Route Directly to Consultant *</label>
                <select
                  value={newRequest.consultantId}
                  onChange={(e) => setNewRequest({ ...newRequest, consultantId: e.target.value })}
                  className="w-full p-2 bg-white border border-[#B3D1F2] rounded-lg text-xs font-extrabold text-[#172033]"
                >
                  {CONSULTANTS.map(c => (
                    <option key={c.id} value={c.id}>👤 {c.name} ({c.title})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-extrabold text-[#172033] block mb-1">Notes / Justification</label>
                <textarea
                  rows={2}
                  value={newRequest.notes}
                  onChange={(e) => setNewRequest({ ...newRequest, notes: e.target.value })}
                  placeholder="Reason for spare part component replacement..."
                  className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRouteModal(false)}
                  className="flex-1 py-2 bg-white border border-[#E4E7EC] rounded-lg text-xs font-extrabold text-[#344054]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#004898] text-white rounded-lg text-xs font-extrabold hover:bg-[#00346E] flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Route Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CREATE RMA WARRANTY CLAIM (NEW FEATURE) */}
      {/* ========================================================================= */}
      {showRmaModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-[#E4E7EC] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#ECFDF5] text-[#047857] flex items-center justify-center border border-[#A7F3D0]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold text-[#172033]">Create RMA Warranty Claim</h3>
              </div>
              <button onClick={() => setShowRmaModal(false)} className="text-[#667085] hover:text-[#172033]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRmaClaim} className="space-y-3.5">
              <div>
                <label className="text-xs font-extrabold text-[#172033] block mb-1">Equipment / License Name *</label>
                <input
                  type="text"
                  required
                  value={newRma.equipmentName}
                  onChange={(e) => setNewRma({ ...newRma, equipmentName: e.target.value })}
                  placeholder="e.g. Logitech Rally Bar 4K / Biamp License Key..."
                  className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-semibold focus:outline-none focus:border-[#004898]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold text-[#172033] block mb-1">Serial # / License Key *</label>
                  <input
                    type="text"
                    required
                    value={newRma.serialNo}
                    onChange={(e) => setNewRma({ ...newRma, serialNo: e.target.value })}
                    placeholder="SN-LOG-994821-IN"
                    className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
                  />
                </div>

                <div>
                  <label className="text-xs font-extrabold text-[#172033] block mb-1">Warranty Type *</label>
                  <select
                    value={newRma.warrantyType}
                    onChange={(e) => setNewRma({ ...newRma, warrantyType: e.target.value })}
                    className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
                  >
                    <option value="Hardware Warranty">Hardware Warranty</option>
                    <option value="Software License / Firmware">Software License / Firmware</option>
                  </select>
                </div>
              </div>

              {/* Vendor & Consultant Target Box */}
              <div className="p-3 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] space-y-1.5">
                <label className="text-xs font-extrabold text-[#047857] block">Route Directly to Vendor / Company Consultant *</label>
                <select
                  value={newRma.vendorId}
                  onChange={(e) => setNewRma({ ...newRma, vendorId: e.target.value })}
                  className="w-full p-2 bg-white border border-[#A7F3D0] rounded-lg text-xs font-extrabold text-[#172033]"
                >
                  {WARRANTY_VENDORS.map(v => (
                    <option key={v.id} value={v.id}>
                      🏢 {v.companyName} ({v.consultantName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-extrabold text-[#172033] block mb-1">Linked Ticket ID</label>
                <select
                  value={newRma.ticketId}
                  onChange={(e) => setNewRma({ ...newRma, ticketId: e.target.value })}
                  className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#172033]"
                >
                  {(tickets || []).map(t => (
                    <option key={t.id} value={t.id}>{t.id}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-extrabold text-[#172033] block mb-1">Defect Justification & Warranty Remarks</label>
                <textarea
                  rows={2}
                  value={newRma.notes}
                  onChange={(e) => setNewRma({ ...newRma, notes: e.target.value })}
                  placeholder="Describe hardware defect or software license failure for OEM claim..."
                  className="w-full p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRmaModal(false)}
                  className="flex-1 py-2 bg-white border border-[#E4E7EC] rounded-lg text-xs font-extrabold text-[#344054]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#12B76A] text-white rounded-lg text-xs font-extrabold hover:bg-[#0E9355] flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Submit RMA Claim</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADD STOCK ITEM */}
      {/* ========================================================================= */}
      {showAddStockModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#172033]">Add Hardware Stock SKU</h3>
            
            <form onSubmit={handleAddStock} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#344054]">Equipment Name</label>
                <input
                  type="text"
                  required
                  value={newStockItem.name}
                  onChange={(e) => setNewStockItem({ ...newStockItem, name: e.target.value })}
                  placeholder="e.g. Logitech Rally Bar 4K"
                  className="w-full mt-1 p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#344054]">Category</label>
                  <select
                    value={newStockItem.category}
                    onChange={(e) => setNewStockItem({ ...newStockItem, category: e.target.value })}
                    className="w-full mt-1 p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold"
                  >
                    <option>Video Conferencing</option>
                    <option>Room Control</option>
                    <option>Audio System</option>
                    <option>Display</option>
                    <option>Microphones</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#344054]">Warehouse Hub</label>
                  <select
                    value={newStockItem.warehouse}
                    onChange={(e) => setNewStockItem({ ...newStockItem, warehouse: e.target.value })}
                    className="w-full mt-1 p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-bold"
                  >
                    <option>Bengaluru Hub</option>
                    <option>Chennai Warehouse</option>
                    <option>Hyderabad Hub</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#344054]">Stock Qty</label>
                  <input
                    type="number"
                    required
                    value={newStockItem.stock}
                    onChange={(e) => setNewStockItem({ ...newStockItem, stock: e.target.value })}
                    className="w-full mt-1 p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#344054]">Min Threshold</label>
                  <input
                    type="number"
                    required
                    value={newStockItem.minThreshold}
                    onChange={(e) => setNewStockItem({ ...newStockItem, minThreshold: e.target.value })}
                    className="w-full mt-1 p-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStockModal(false)}
                  className="flex-1 py-2 bg-white border border-[#E4E7EC] rounded-lg text-xs font-extrabold text-[#344054]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#004898] text-white rounded-lg text-xs font-extrabold hover:bg-[#00346E]"
                >
                  Save Stock Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
