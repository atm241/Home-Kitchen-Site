import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import styles from './BarcodeScanner.module.css';

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onDetected, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current!,
        (result, err, controls) => {
          controlsRef.current = controls;
          if (cancelled) return;
          if (result) {
            controls.stop();
            onDetected(result.getText());
          }
        }
      )
      .catch(() => {
        if (!cancelled) setError('Could not access the camera. Check permissions and try again.');
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Scan Barcode</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        {error ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <>
            <video ref={videoRef} className={styles.video} muted playsInline />
            <p className={styles.hint}>Point your camera at a product barcode</p>
          </>
        )}
      </div>
    </div>
  );
};

export default BarcodeScanner;
