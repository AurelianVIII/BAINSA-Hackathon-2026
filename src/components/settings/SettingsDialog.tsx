"use client";

import { useEffect, useRef } from "react";

export function SettingsDialog({
  isOpen,
  onClose,
  useRealCamera,
  onToggleRealCamera,
  cameraError,
}: {
  isOpen: boolean;
  onClose: () => void;
  useRealCamera: boolean;
  onToggleRealCamera: (active: boolean) => void;
  cameraError?: string | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // When settings dialogue is open with real camera enabled, show live preview
  useEffect(() => {
    if (!isOpen || !useRealCamera) return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 640, height: 480 } })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = mediaStream;
          previewVideoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [isOpen, useRealCamera]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <h2
            id="settings-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Camera &amp; Attention Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Real webcam attention tracking
              </span>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Uses MediaPipe Face Landmarker on your browser to measure gaze, brow
                confusion, and 6-DOF head pose live.
              </p>
            </div>
            <input
              type="checkbox"
              role="switch"
              aria-checked={useRealCamera}
              checked={useRealCamera}
              onChange={(e) => onToggleRealCamera(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-zinc-900 dark:accent-zinc-100"
            />
          </label>

          {/* Camera Dialogue & Preview */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Camera preview
            </span>
            <div className="relative mt-2 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-900">
              {useRealCamera ? (
                <>
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute left-1/2 top-[34%] h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-emerald-400">
                    <span className="absolute -left-0.5 -top-0.5 h-2 w-2 border-l-2 border-t-2 border-emerald-400" />
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 border-r-2 border-t-2 border-emerald-400" />
                    <span className="absolute -bottom-0.5 -left-0.5 h-2 w-2 border-b-2 border-l-2 border-emerald-400" />
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 border-b-2 border-r-2 border-emerald-400" />
                  </div>
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                    Live camera active
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <svg
                    viewBox="0 0 100 100"
                    className="h-16 w-16 text-zinc-600"
                    fill="currentColor"
                  >
                    <circle cx="50" cy="38" r="18" />
                    <path d="M20 95 C20 65 35 55 50 55 C65 55 80 65 80 95 Z" />
                  </svg>
                  <p className="text-xs text-zinc-400">
                    Camera is off. Enable the toggle above to preview and analyze your live webcam.
                  </p>
                </div>
              )}
            </div>

            {cameraError && (
              <p role="alert" className="mt-2 text-xs text-rose-500">
                {cameraError}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
