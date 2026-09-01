import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const DatePicker = ({ selectedDate, onSelect, onClose }) => {
  // Parse the current selected date or default to today
  const [currentMonth, setCurrentMonth] = useState(
    selectedDate ? new Date(selectedDate) : new Date()
  );

  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  ).getDay();

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDateClick = (day) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    // Format as "DD MMM YYYY"
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    onSelect(newDate.toLocaleDateString('en-GB', options));
    onClose();
  };

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  return (
    <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-[#E4E7EC] rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      
      {/* Header Controls */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-[#E4E7EC] bg-[#F8FAFC]">
        <button onClick={handlePrevMonth} className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-[#E4E7EC] shadow-sm transition-all cursor-pointer">
          <ChevronLeft className="w-4 h-4 text-[#667085]" />
        </button>
        <div className="font-extrabold text-[13px] text-[#172033]">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </div>
        <button onClick={handleNextMonth} className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-[#E4E7EC] shadow-sm transition-all cursor-pointer">
          <ChevronRight className="w-4 h-4 text-[#667085]" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
            <div key={day} className="text-center text-[10px] font-bold text-[#98A2B3] uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {blanks.map(blank => (
            <div key={`blank-${blank}`} className="w-8 h-8"></div>
          ))}
          {days.map(day => {
            const isSelected = selectedDate && 
              new Date(selectedDate).getDate() === day &&
              new Date(selectedDate).getMonth() === currentMonth.getMonth() &&
              new Date(selectedDate).getFullYear() === currentMonth.getFullYear();

            // Highlight today visually but don't force select it
            const today = new Date();
            const isToday = 
              today.getDate() === day &&
              today.getMonth() === currentMonth.getMonth() &&
              today.getFullYear() === currentMonth.getFullYear();

            return (
              <button
                key={day}
                onClick={() => handleDateClick(day)}
                className={`w-8 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                  isSelected 
                    ? 'bg-[#004898] text-white shadow-md' 
                    : isToday
                      ? 'bg-[#EFF5FC] text-[#004898] hover:bg-[#D4E6FA]'
                      : 'text-[#475467] hover:bg-[#F8FAFC]'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Footer */}
      <div className="px-4 py-3 bg-[#F8FAFC] border-t border-[#E4E7EC] flex justify-between items-center">
        <span className="text-[10px] font-bold text-[#98A2B3] uppercase tracking-wide">Real-time Scheduling</span>
        <button 
          onClick={() => {
            const today = new Date();
            const options = { day: 'numeric', month: 'short', year: 'numeric' };
            onSelect(today.toLocaleDateString('en-GB', options));
            onClose();
          }}
          className="text-xs font-bold text-[#004898] hover:underline cursor-pointer"
        >
          Go to Today
        </button>
      </div>
    </div>
  );
};
