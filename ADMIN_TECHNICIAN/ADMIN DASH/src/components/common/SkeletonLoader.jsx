import React from 'react';

export const TableSkeleton = ({ rows = 5 }) => {
  return (
    <div className="table-container">
      <div className="p-4 border-b border-[#E4E7EC] flex justify-between items-center">
        <div className="w-48 h-8 skeleton"></div>
        <div className="w-32 h-8 skeleton"></div>
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="flex gap-4 items-center">
            <div className="w-24 h-6 skeleton"></div>
            <div className="w-40 h-6 skeleton"></div>
            <div className="w-32 h-6 skeleton"></div>
            <div className="w-28 h-6 skeleton"></div>
            <div className="w-20 h-6 skeleton"></div>
            <div className="flex-1 h-6 skeleton"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CardSkeleton = () => {
  return (
    <div className="card p-5 space-y-3">
      <div className="w-1/3 h-4 skeleton"></div>
      <div className="w-1/2 h-8 skeleton"></div>
      <div className="w-full h-12 skeleton"></div>
    </div>
  );
};
