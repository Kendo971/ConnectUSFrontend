"use client";

import { useEffect, useRef, useState } from "react";
import { useCall } from "../lib/call/call-context";

function Video({ stream, muted }: { stream: MediaStream | null; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className="h-full w-full rounded-lg bg-black object-cover"
    />
  );
}

/**
 * Barre d'appel intégrée, affichée en haut de la conversation : vignettes
 * vidéo locale/distante, contrôles, et bascule plein écran (Fullscreen API,
 * fallback overlay CSS si l'API échoue).
 */
export function CallBar() {
  const {
    status,
    localStream,
    remoteStream,
    micEnabled,
    camEnabled,
    toggleMic,
    toggleCam,
    hangup,
  } = useCall();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [fallbackFs, setFallbackFs] = useState(false);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFallbackFs(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => setFallbackFs(true));
    } else {
      setFallbackFs((v) => !v);
    }
  };

  const statusLabel =
    status === "ringing"
      ? "Appel en cours…"
      : status === "active"
        ? "En appel"
        : status;

  return (
    <div className="border-b border-white/10 bg-[#162032] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-300">{statusLabel}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMic}
            className="rounded-md bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
          >
            {micEnabled ? "Mute" : "Unmute"}
          </button>
          <button
            type="button"
            onClick={toggleCam}
            className="rounded-md bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
          >
            {camEnabled ? "Cam off" : "Cam on"}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-md bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
            aria-label="Plein écran"
          >
            ⛶
          </button>
          <button
            type="button"
            onClick={() => hangup().catch((e) => alert(String(e?.message ?? e)))}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500"
          >
            Raccrocher
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={
          fallbackFs
            ? "fixed inset-0 z-[90] grid grid-cols-1 gap-2 bg-black p-4 lg:grid-cols-2"
            : "mt-3 grid grid-cols-2 gap-2"
        }
      >
        <div
          className={
            fallbackFs
              ? "relative overflow-hidden rounded-lg bg-black"
              : "relative aspect-video overflow-hidden rounded-lg bg-black"
          }
        >
          <div className="absolute left-2 top-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[11px]">
            Moi
          </div>
          <Video stream={localStream} muted />
        </div>
        <div
          className={
            fallbackFs
              ? "relative overflow-hidden rounded-lg bg-black"
              : "relative aspect-video overflow-hidden rounded-lg bg-black"
          }
        >
          <div className="absolute left-2 top-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[11px]">
            Interlocuteur
          </div>
          <Video stream={remoteStream} />
        </div>
      </div>
    </div>
  );
}
