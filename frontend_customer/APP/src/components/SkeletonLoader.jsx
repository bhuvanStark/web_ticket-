import React from 'react';

export function SkeletonLoader() {
  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="skeleton" style={{ width: '120px', height: '14px' }} />
          <div className="skeleton" style={{ width: '180px', height: '24px' }} />
        </div>
        <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '12px' }} />
      </div>

      {/* Banner skeleton */}
      <div className="skeleton" style={{ width: '100%', height: '140px', borderRadius: '16px' }} />

      {/* Cards skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="skeleton" style={{ width: '140px', height: '18px' }} />
        <div className="skeleton" style={{ width: '100%', height: '110px', borderRadius: '12px' }} />
        <div className="skeleton" style={{ width: '100%', height: '110px', borderRadius: '12px' }} />
      </div>
    </div>
  );
}
