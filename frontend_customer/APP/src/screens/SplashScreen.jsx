import React from 'react';
import { Shield, ChevronRight, Zap } from 'lucide-react';

// The splash waits for the user to press "Continue to Portal" — it does not
// auto-advance.
export function SplashScreen({ onStart }) {
  return (
    <div style={{
      height: '100%',
      width: '100%',
      background: 'linear-gradient(180deg, #004898 0%, #002D62 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'between',
      padding: '48px 24px 36px 24px',
      color: '#FFFFFF',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Subtle Background Geometry Accent */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-20%',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textCenter: 'center' }}>
        <div style={{
          width: '84px',
          height: '84px',
          borderRadius: '20px',
          background: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#004898',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          marginBottom: '24px'
        }}>
          <Shield size={46} strokeWidth={2.2} />
        </div>

        <h1 style={{ fontSize: '32px', fontWeight: '800', tracking: '-0.5px', marginBottom: '8px' }}>
          TaskTel
        </h1>

        <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.85)', fontWeight: '500', textAlign: 'center' }}>
          AV Service. Simplified.
        </p>

        <div style={{
          marginTop: '36px',
          padding: '6px 14px',
          borderRadius: '20px',
          background: 'rgba(255, 255, 255, 0.12)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          fontSize: '12px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Zap size={13} fill="#fff" />
          <span>Enterprise Support Portal</span>
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={onStart}
          style={{
            width: '100%',
            background: '#FFFFFF',
            color: '#004898',
            border: 'none',
            borderRadius: '12px',
            padding: '14px',
            fontSize: '15px',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.2)'
          }}
        >
          <span>Continue to Portal</span>
          <ChevronRight size={18} />
        </button>

        <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>
          Powered by TaskTel AV Systems & Services
        </span>
      </div>
    </div>
  );
}
