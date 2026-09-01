import React, { useState, useRef, useEffect } from 'react';
import { QrCode, Camera, CheckCircle2, Zap, X, VideoOff } from 'lucide-react';
// Removed mockData import

export function QRScannerModal({ onClose, onScanRoomSuccess }) {
  const [scanning, setScanning] = useState(false);
  const [scannedRoom, setScannedRoom] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);

  const startLiveCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      console.warn('Camera access fallback:', err);
      alert('Camera access unavailable. Using QuickScan simulator instead.');
    }
  };

  const stopLiveCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopLiveCamera();
    };
  }, []);

  const handleSimulateScan = (roomId) => {
    setScanning(true);
    const room = { id: roomId, name: 'Room' };
    
    setTimeout(() => {
      setScanning(false);
      setScannedRoom(room);
      stopLiveCamera();
      
      setTimeout(() => {
        onScanRoomSuccess(room.id);
      }, 1000);
    }, 1200);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          borderRadius: 'var(--radius-xl)', 
          maxWidth: '380px', 
          textAlign: 'center',
          padding: '28px 20px',
          background: '#0F172A',
          color: '#FFFFFF'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} color="#004898" />
            <span style={{ fontSize: '14px', fontWeight: '800' }}>TaskTel Live QR Camera Scan</span>
          </div>
          <button onClick={() => { stopLiveCamera(); onClose(); }} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Viewfinder Camera Container */}
        <div style={{
          width: '240px',
          height: '240px',
          margin: '0 auto 20px auto',
          borderRadius: '20px',
          border: '2px solid rgba(255, 255, 255, 0.2)',
          position: 'relative',
          background: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justify: 'center',
          overflow: 'hidden'
        }}>
          {/* Laser Scanning Line Animation */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #004898, transparent)',
            boxShadow: '0 0 15px #004898',
            animation: 'shimmer 2s infinite linear',
            zIndex: 10
          }} />

          {/* Live Video Camera Stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: cameraActive ? 'block' : 'none'
            }}
          />

          {!cameraActive && (
            scannedRoom ? (
              <div style={{ color: '#10B981', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={48} />
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#FFF' }}>{scannedRoom.name} Detected!</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Opening Service Desk...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: '#94A3B8' }}>
                <QrCode size={64} color="#004898" />
                <div style={{ fontSize: '12px', padding: '0 16px' }}>
                  {scanning ? 'Decoding Room Hardware Data...' : 'Align Meeting Room QR code inside frame'}
                </div>
              </div>
            )
          )}
        </div>

        {/* Live Camera Toggle & Simulator Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {!cameraActive ? (
            <button
              onClick={startLiveCamera}
              className="btn-primary"
              style={{ padding: '10px', fontSize: '13px', background: '#10B981', color: '#FFF' }}
            >
              <Camera size={16} />
              <span>Open Live Phone Camera</span>
            </button>
          ) : (
            <button
              onClick={stopLiveCamera}
              className="btn-secondary"
              style={{ padding: '10px', fontSize: '13px', color: '#FF4D4D', borderColor: '#FF4D4D', background: 'transparent' }}
            >
              <VideoOff size={16} />
              <span>Turn Off Camera</span>
            </button>
          )}

          <button
            onClick={() => handleSimulateScan('rm-boardroom')}
            style={{
              background: '#004898',
              color: '#FFF',
              border: 'none',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            Scan Boardroom Tag (QR-BLR-BR-01)
          </button>

          <button
            onClick={() => handleSimulateScan('rm-mr01')}
            style={{
              background: '#1E293B',
              color: '#FFF',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Scan Meeting Room 01 Tag (QR-BLR-MR-01)
          </button>
        </div>
      </div>
    </div>
  );
}
