import React, { useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';

/**
 * QRScanner — uses MediaDevices API + jsQR for browser-based QR decoding
 * (Algorithm 3.7.2 Step 1 — decode QR from camera feed)
 */
export default function QRScanner({ onScan, onError }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext('2d');
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });
      if (code) {
        onScan(code.data);
        return; // Stop scanning after successful read
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onScan]);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          rafRef.current = requestAnimationFrame(tick);
        }
      })
      .catch(err => onError && onError('Camera access denied: ' + err.message));

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [tick, onError]);

  return (
    <div className="scanner-container">
      <video ref={videoRef} muted playsInline style={{ width: '100%', borderRadius: 12 }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <p style={{ textAlign: 'center', marginTop: 8, color: '#666', fontSize: '0.85rem' }}>
        Point your camera at the QR code displayed by your lecturer
      </p>
    </div>
  );
}
