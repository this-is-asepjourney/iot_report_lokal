"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export default function QrScanInput({ label, value, onChange, placeholder }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    return () => {
      stopScan();
    };
  }, []);

  async function startScan() {
    setScanError("");
    setIsScanning(true);
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const deviceId = devices[0]?.deviceId;
      if (!deviceId || !videoRef.current) {
        throw new Error("Kamera tidak ditemukan.");
      }

      controlsRef.current = await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result) => {
          if (result) {
            onChange(result.getText());
            stopScan();
          }
        }
      );
    } catch (err) {
      setScanError((err as Error).message);
      stopScan();
    }
  }

  function stopScan() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    readerRef.current = null;
    setIsScanning(false);
  }

  return (
    <label className="grid gap-1 text-sm">
      <span className="text-[var(--color-primary)]">{label}</span>
      <div className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[44px] min-w-0 flex-1 rounded border border-[var(--color-secondary)] p-2 text-base sm:min-h-0"
          placeholder={placeholder}
          required
        />
        {!isScanning ? (
          <button
            type="button"
            onClick={startScan}
            className="min-h-[44px] shrink-0 rounded bg-[var(--color-secondary)] px-3 py-2 text-white hover:opacity-90 sm:min-h-0"
          >
            Scan QR
          </button>
        ) : (
          <button
            type="button"
            onClick={stopScan}
            className="min-h-[44px] shrink-0 rounded bg-[var(--color-primary)] px-3 py-2 text-white hover:opacity-90 sm:min-h-0"
          >
            Stop
          </button>
        )}
      </div>

      {isScanning && (
        <video
          ref={videoRef}
          className="mt-2 w-full max-w-sm rounded border border-[var(--color-secondary)]"
          muted
        />
      )}
      {scanError && <p className="text-xs text-rose-600">{scanError}</p>}
    </label>
  );
}
