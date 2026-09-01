import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, Check, X, SwitchCamera, AlertCircle } from 'lucide-react';

export function CameraCaptureModal({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'user' | 'environment'
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  // Start Camera Stream
  const startCamera = async (mode = facingMode) => {
    setLoading(true);
    setErrorMsg(null);

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported by browser. Use file upload.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('Camera stream error:', err);
      setErrorMsg('Camera permission blocked or device unavailable. Use file upload below.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    startCamera(facingMode);

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode]);

  // Capture Frame from Video
  const handleSnapPhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);

    // Pause stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  // Retake Photo
  const handleRetake = () => {
    setCapturedImage(null);
    startCamera(facingMode);
  };

  // Confirm Photo
  const handleConfirmPhoto = () => {
    if (capturedImage) {
      onCapture({
        id: Date.now(),
        name: `Camera_Photo_${new Date().toLocaleTimeString().replace(/:/g, '')}.jpg`,
        url: capturedImage,
        preview: capturedImage,
        type: 'Photo',
        size: '1.2 MB'
      });
      onClose();
    }
  };

  // Fallback Native Input File Change
  const handleNativeFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onCapture({
          id: Date.now(),
          name: file.name,
          url: reader.result,
          preview: reader.result,
          type: 'Photo',
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        });
        onClose();
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999, background: 'rgba(0, 0, 0, 0.9)' }}>
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '440px', 
          width: '94%', 
          padding: '0', 
          borderRadius: '20px', 
          overflow: 'hidden', 
          background: '#111', 
          color: '#FFF',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        {/* Modal Top Header */}
        <div style={{
          width: '100%',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.05)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={20} color="#007AFF" />
            <span style={{ fontSize: '15px', fontWeight: '700' }}>Live Camera Viewfinder</span>
          </div>

          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Viewfinder Body */}
        <div style={{ position: 'relative', width: '100%', height: '340px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {capturedImage ? (
            <img 
              src={capturedImage} 
              alt="Captured proof" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          ) : errorMsg ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#AAA', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <AlertCircle size={36} color="#EF4444" />
              <p style={{ fontSize: '13px', color: '#EEE', maxWidth: '280px' }}>{errorMsg}</p>
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary"
                style={{ fontSize: '13px', padding: '10px 18px', marginTop: '8px' }}
              >
                <span>Upload from Device Gallery</span>
              </button>
            </div>
          ) : (
            <>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
              />

              {/* Viewfinder Target Framing Reticle */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '75%',
                height: '70%',
                border: '2px dashed rgba(255, 255, 255, 0.6)',
                borderRadius: '16px',
                pointerEvents: 'none',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.3)'
              }} />

              {/* Facing mode switch button */}
              <button
                onClick={toggleFacingMode}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#FFF',
                  borderRadius: '50%',
                  width: '38px',
                  height: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <SwitchCamera size={18} />
              </button>
            </>
          )}

          {/* Hidden Canvas for Frame Capture */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Hidden Native File Input */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={handleNativeFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        {/* Modal Controls Bar */}
        <div style={{ width: '100%', padding: '16px 20px', background: '#181818', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {capturedImage ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: '#FFF',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={16} />
                <span>Retake</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmPhoto}
                style={{
                  background: '#10B981',
                  border: 'none',
                  color: '#FFF',
                  padding: '10px 22px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <Check size={16} />
                <span>Use Photo</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#AAA',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Choose File
              </button>

              <button
                type="button"
                onClick={handleSnapPhoto}
                disabled={!!errorMsg || loading}
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: '#FFF',
                  border: '4px solid #007AFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 0 16px rgba(0, 122, 255, 0.5)'
                }}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#007AFF' }} />
              </button>

              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#AAA',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
