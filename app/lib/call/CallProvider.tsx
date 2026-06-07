"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { getIdentity } from "../identity";
import {
  CallContext,
  type CallContextValue,
  type CallStatus,
  type CallType,
  type IncomingPayload,
} from "./call-context";

type CallDto = {
  id: number;
  conversationId: number;
  callerId: number;
  calleeId: number;
  status: string;
  type: CallType;
};

const backendWsBase = () =>
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5555";

/**
 * État d'appel global (socket /call + WebRTC), monté au niveau du layout.
 * Persiste entre les pages : permet de recevoir un appel partout dans l'app.
 */
export function CallProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [userId, setUserId] = useState<number | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const [incoming, setIncoming] = useState<IncomingPayload | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(
    null,
  );
  const [callId, setCallId] = useState<number | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [audioReady, setAudioReady] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const toneStopRef = useRef<(() => void) | null>(null);

  const setCallIdBoth = (id: number | null) => {
    callIdRef.current = id;
    setCallId(id);
  };

  // --- Tonalités (ringback / ring) -----------------------------------------

  const stopTone = () => {
    try {
      toneStopRef.current?.();
    } catch {
      // ignore
    }
    toneStopRef.current = null;
  };

  const ensureAudio = async () => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume().catch(() => undefined);
      }
      return audioCtxRef.current;
    }
    const Ctx =
      globalThis.AudioContext ||
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }
    return ctx;
  };

  const startTone = async (kind: "ringback" | "ring") => {
    stopTone();
    const ctx = await ensureAudio();
    if (!ctx) return;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = kind === "ringback" ? 440 : 480;
    osc.connect(gain);
    osc.start();

    let timer: number | null = null;
    const schedule = () => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
      if (kind === "ringback") {
        gain.gain.setValueAtTime(0.18, now + 0.02);
        gain.gain.setValueAtTime(0, now + 1.0);
        timer = globalThis.setTimeout(schedule, 3000) as unknown as number;
        return;
      }
      gain.gain.setValueAtTime(0.22, now + 0.02);
      gain.gain.setValueAtTime(0, now + 0.4);
      gain.gain.setValueAtTime(0.22, now + 0.6);
      gain.gain.setValueAtTime(0, now + 1.0);
      timer = globalThis.setTimeout(schedule, 3000) as unknown as number;
    };
    schedule();

    toneStopRef.current = () => {
      if (timer !== null) clearTimeout(timer);
      try {
        osc.stop();
      } catch {
        // ignore
      }
      try {
        osc.disconnect();
      } catch {
        // ignore
      }
      try {
        gain.disconnect();
      } catch {
        // ignore
      }
    };
  };

  // --- WebRTC ---------------------------------------------------------------

  async function ensureLocalMedia() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }

  async function ensurePeer() {
    if (pcRef.current) return pcRef.current;
    const stream = await ensureLocalMedia();

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    });

    const remote = new MediaStream();
    remoteStreamRef.current = remote;
    setRemoteStream(remote);

    pc.ontrack = (ev) => {
      if (ev.track) remote.addTrack(ev.track);
      ev.streams?.[0]?.getTracks().forEach((t) => remote.addTrack(t));
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      if (!socketRef.current) return;
      const current = callIdRef.current;
      if (current === null) return;
      socketRef.current.emit("signal:ice", {
        callId: current,
        candidate: ev.candidate.toJSON(),
      });
    };

    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pcRef.current = pc;
    return pc;
  }

  async function startOffer(explicitCallId?: number) {
    if (!socketRef.current) return;
    const id = explicitCallId ?? callIdRef.current;
    if (id === null) return;
    await ensurePeer();
    const pc = pcRef.current;
    if (!pc) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current.emit("signal:offer", { callId: id, sdp: offer });
  }

  async function cleanup() {
    setIncoming(null);
    stopTone();
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
    const ls = localStreamRef.current;
    if (ls) ls.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    const rs = remoteStreamRef.current;
    if (rs) rs.getTracks().forEach((t) => t.stop());
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallIdBoth(null);
  }

  // --- Actions exposées -----------------------------------------------------

  async function startCall(conversationId: number) {
    if (!socketRef.current) throw new Error("Socket indisponible");
    setActiveConversationId(conversationId);
    await ensureLocalMedia();
    setCallStatus("ringing");

    const ack = (await new Promise<CallDto | { error: string }>((resolve) => {
      socketRef.current?.emit(
        "call:initiate",
        { conversationId, type: "VIDEO" as CallType },
        (res: CallDto | { error: string }) => resolve(res),
      );
    })) as CallDto | { error: string };

    if ("error" in ack) {
      setCallStatus("error");
      throw new Error(ack.error);
    }
    setCallIdBoth(ack.id);
    setCallStatus("ringing");
  }

  async function acceptCall() {
    if (!socketRef.current) throw new Error("Socket indisponible");
    if (callIdRef.current === null) throw new Error("callId manquant");
    await ensureLocalMedia();
    await ensurePeer();

    const ack = await new Promise<CallDto | { error: string }>((resolve) => {
      socketRef.current?.emit(
        "call:accept",
        { callId: callIdRef.current },
        (res: CallDto | { error: string }) => resolve(res),
      );
    });
    if ("error" in ack) {
      setCallStatus("error");
      throw new Error(ack.error);
    }
    setIncoming(null);
    setCallStatus("active");
    stopTone();
  }

  async function declineCall() {
    if (!socketRef.current) throw new Error("Socket indisponible");
    if (callIdRef.current === null) throw new Error("callId manquant");
    const ack = await new Promise<CallDto | { error: string }>((resolve) => {
      socketRef.current?.emit(
        "call:decline",
        { callId: callIdRef.current },
        (res: CallDto | { error: string }) => resolve(res),
      );
    });
    if ("error" in ack) {
      setCallStatus("error");
      throw new Error(ack.error);
    }
    setCallStatus("declined");
    stopTone();
    await cleanup();
  }

  async function hangup() {
    if (socketRef.current && callIdRef.current !== null) {
      await new Promise<void>((resolve) => {
        socketRef.current?.emit(
          "call:hangup",
          { callId: callIdRef.current },
          () => resolve(),
        );
      });
    }
    setCallStatus("ended");
    stopTone();
    await cleanup();
  }

  const toggleMic = () => setMicEnabled((v) => !v);
  const toggleCam = () => setCamEnabled((v) => !v);

  // --- Effets ---------------------------------------------------------------

  // Déblocage audio au premier geste utilisateur (politique navigateur).
  useEffect(() => {
    const onFirstGesture = () => {
      setAudioReady(true);
      void ensureAudio();
      globalThis.removeEventListener("pointerdown", onFirstGesture);
      globalThis.removeEventListener("keydown", onFirstGesture);
    };
    globalThis.addEventListener("pointerdown", onFirstGesture);
    globalThis.addEventListener("keydown", onFirstGesture);
    return () => {
      globalThis.removeEventListener("pointerdown", onFirstGesture);
      globalThis.removeEventListener("keydown", onFirstGesture);
    };
  }, []);

  // Identité (sessionStorage, par onglet) ré-évaluée au changement de route.
  useEffect(() => {
    setUserId(getIdentity()?.userId ?? null);
  }, [pathname]);

  // Socket /call : ouverte tant qu'une identité existe, indépendante des pages.
  useEffect(() => {
    if (userId === null) return;
    const socket = io(`${backendWsBase()}/call`, {
      auth: { userId },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));

    // Incoming GLOBAL (plus de filtre par conversationId).
    socket.on("call:incoming", (payload: IncomingPayload) => {
      setIncoming(payload);
      setActiveConversationId(payload.conversationId);
      setCallIdBoth(payload.callId);
      setCallStatus("incoming");
    });

    socket.on("call:accepted", ({ callId: id }: { callId: number }) => {
      const current = callIdRef.current;
      if (current !== null && id !== current) return;
      if (current === null) setCallIdBoth(id);
      setCallStatus("active");
      void startOffer(id);
    });

    socket.on("call:declined", ({ callId: id }: { callId: number }) => {
      const current = callIdRef.current;
      if (current !== null && id !== current) return;
      setCallStatus("declined");
      void cleanup();
    });

    socket.on("call:ended", ({ callId: id }: { callId: number }) => {
      const current = callIdRef.current;
      if (current !== null && id !== current) return;
      setCallStatus("ended");
      void cleanup();
    });

    socket.on(
      "signal:offer",
      async (payload: { callId: number; sdp: RTCSessionDescriptionInit }) => {
        const current = callIdRef.current;
        if (current !== null && payload.callId !== current) return;
        if (current === null) setCallIdBoth(payload.callId);
        await ensurePeer();
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal:answer", { callId: payload.callId, sdp: answer });
        setCallStatus("active");
      },
    );

    socket.on(
      "signal:answer",
      async (payload: { callId: number; sdp: RTCSessionDescriptionInit }) => {
        const current = callIdRef.current;
        if (current === null || payload.callId !== current) return;
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      },
    );

    socket.on(
      "signal:ice",
      async (payload: { callId: number; candidate: RTCIceCandidateInit }) => {
        const current = callIdRef.current;
        if (current === null || payload.callId !== current) return;
        const pc = pcRef.current;
        if (!pc) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {
          // ignore
        }
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Tonalités selon le statut.
  useEffect(() => {
    if (!audioReady) return;
    if (callStatus === "incoming") {
      void startTone("ring");
      return;
    }
    if (callStatus === "ringing") {
      void startTone("ringback");
      return;
    }
    stopTone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioReady, callStatus]);

  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
  }, [localStream, micEnabled]);

  useEffect(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => (t.enabled = camEnabled));
  }, [localStream, camEnabled]);

  const value: CallContextValue = {
    status: callStatus,
    socketConnected,
    incoming,
    activeConversationId,
    callId,
    localStream,
    remoteStream,
    micEnabled,
    camEnabled,
    startCall,
    acceptCall,
    declineCall,
    hangup,
    toggleMic,
    toggleCam,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
