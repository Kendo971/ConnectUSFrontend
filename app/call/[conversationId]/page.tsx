"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";

type CallType = "VIDEO" | "AUDIO";

type IncomingPayload = {
  callId: number;
  callerId: number;
  callerName?: string;
  type: CallType;
  conversationId: number;
};

type CallDto = {
  id: number;
  conversationId: number;
  callerId: number;
  calleeId: number;
  status: "RINGING" | "ACTIVE" | "MISSED" | "ENDED";
  type: CallType;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  endReason: string | null;
};

const backendWsBase = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5555";

function Video({ stream, muted }: { stream: MediaStream | null; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className="h-full w-full rounded-xl bg-black object-cover"
    />
  );
}

export default function CallPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const search = useSearchParams();

  const [conversationId, setConversationId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number>(() => {
    const sp = Number(search.get("userId") ?? "");
    if (!Number.isNaN(sp) && sp > 0) return sp;
    const stored = Number(globalThis?.localStorage?.getItem("connectus.userId") ?? "");
    return !Number.isNaN(stored) && stored > 0 ? stored : 1;
  });

  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const [callId, setCallId] = useState<number | null>(null);
  const callIdRef = useRef<number | null>(null);
  const [incoming, setIncoming] = useState<IncomingPayload | null>(null);
  const [callStatus, setCallStatus] = useState<string>("idle");

  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);

  const [audioReady, setAudioReady] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const toneStopRef = useRef<(() => void) | null>(null);

  const setCallIdBoth = (id: number | null) => {
    callIdRef.current = id;
    setCallId(id);
  };

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

    const Ctx = (globalThis.AudioContext || (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) {
      return null;
    }

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

    // Pattern simple:
    // - ringback: 1s ON / 2s OFF
    // - ring: 0.4s ON / 0.2s OFF / 0.4s ON / 2s OFF
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

      // ring
      gain.gain.setValueAtTime(0.22, now + 0.02);
      gain.gain.setValueAtTime(0, now + 0.4);
      gain.gain.setValueAtTime(0.22, now + 0.6);
      gain.gain.setValueAtTime(0, now + 1.0);
      timer = globalThis.setTimeout(schedule, 3000) as unknown as number;
    };
    schedule();

    toneStopRef.current = () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
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

  const canStart = useMemo(
    () => conversationId !== null && socketConnected && callId === null,
    [conversationId, socketConnected, callId],
  );

  const hasIncoming = incoming !== null && callId !== null;
  const canAccept = socketConnected && hasIncoming;
  const canHangup = socketConnected && callId !== null;

  const humanStatus = useMemo(() => {
    if (!socketConnected) return "Connexion…";
    if (callStatus === "idle") return "Prêt";
    if (callStatus === "ringing") return "Appel en cours…";
    if (callStatus === "incoming") return "Appel entrant";
    if (callStatus === "active") return "En appel";
    if (callStatus === "declined") return "Refusé";
    if (callStatus === "ended") return "Terminé";
    if (callStatus === "error") return "Erreur";
    return callStatus;
  }, [callStatus, socketConnected]);

  useEffect(() => {
    (async () => {
      const p = await params;
      const id = Number(p.conversationId);
      setConversationId(Number.isNaN(id) ? null : id);
    })().catch(() => {
      setConversationId(null);
    });
  }, [params]);

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

  useEffect(() => {
    try {
      localStorage.setItem("connectus.userId", String(userId));
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    const url = `${backendWsBase()}/call`;
    const socket = io(url, {
      auth: { userId },
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));

    socket.on("call:incoming", (payload: IncomingPayload) => {
      if (conversationId !== null && payload.conversationId !== conversationId) return;
      setIncoming(payload);
      setCallIdBoth(payload.callId);
      setCallStatus("incoming");
    });

    socket.on("call:accepted", ({ callId: id }: { callId: number }) => {
      // Seulement l'appelant reçoit call:accepted. On démarre donc l'offre ici.
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

    socket.on("call:ended", ({ callId: id }: { callId: number; reason?: string }) => {
      const current = callIdRef.current;
      if (current !== null && id !== current) return;
      setCallStatus("ended");
      void cleanup();
    });

    socket.on("signal:offer", async (payload: { callId: number; sdp: RTCSessionDescriptionInit }) => {
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
    });

    socket.on("signal:answer", async (payload: { callId: number; sdp: RTCSessionDescriptionInit }) => {
      const current = callIdRef.current;
      if (current === null || payload.callId !== current) return;
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });

    socket.on("signal:ice", async (payload: { callId: number; candidate: RTCIceCandidateInit }) => {
      const current = callIdRef.current;
      if (current === null || payload.callId !== current) return;
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        // ignore
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, conversationId]);

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
      // Certains navigateurs n'exposent pas toujours ev.streams[0]
      // (ou il arrive tard) : on ajoute la track directement.
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

  async function startCall() {
    if (!socketRef.current) throw new Error("Socket indisponible");
    if (conversationId === null) throw new Error("Conversation invalide");

    await ensureLocalMedia();

    setCallStatus("ringing");
    if (audioReady) {
      void startTone("ringback");
    }

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
    if (callId === null) throw new Error("callId manquant");

    await ensureLocalMedia();
    await ensurePeer();

    const ack = await new Promise<CallDto | { error: string }>((resolve) => {
      socketRef.current?.emit("call:accept", { callId }, (res: CallDto | { error: string }) => resolve(res));
    });

    if ("error" in ack) {
      setCallStatus("error");
      throw new Error(ack.error);
    }

    setCallStatus("active");
    stopTone();
  }

  async function declineCall() {
    if (!socketRef.current) throw new Error("Socket indisponible");
    if (callId === null) throw new Error("callId manquant");

    const ack = await new Promise<CallDto | { error: string }>((resolve) => {
      socketRef.current?.emit("call:decline", { callId }, (res: CallDto | { error: string }) => resolve(res));
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
    if (socketRef.current && callId !== null) {
      await new Promise<void>((resolve) => {
        socketRef.current?.emit("call:hangup", { callId }, () => resolve());
      });
    }

    setCallStatus("ended");
    stopTone();
    await cleanup();
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
    return () => {
      void cleanup();
      try {
        audioCtxRef.current?.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
  }, [localStream, micEnabled]);

  useEffect(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => (t.enabled = camEnabled));
  }, [localStream, camEnabled]);

  return (
    <div className="min-h-screen bg-[#0f1623] px-6 py-6 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Appel vidéo</div>
          <div className="mt-1 text-sm text-zinc-400">
            Conversation {conversationId ?? "?"} · User {userId}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/chat" className="rounded-md px-3 py-2 text-sm hover:bg-white/5">
            Retour chat
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-6 grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
          <div className="absolute left-3 top-3 z-10 rounded-md bg-black/60 px-2 py-1 text-xs">Moi</div>
          <Video stream={localStream} muted />
        </div>
        <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
          <div className="absolute left-3 top-3 z-10 rounded-md bg-black/60 px-2 py-1 text-xs">Interlocuteur</div>
          <Video stream={remoteStream} />
        </div>
      </div>

      <div className="mx-auto mt-6 w-full max-w-6xl rounded-xl border border-white/10 bg-[#121a2a] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-300">
            <span className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs ${socketConnected ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
              <span className={`h-2 w-2 rounded-full ${socketConnected ? "bg-emerald-400" : "bg-amber-400"}`} />
              {socketConnected ? "Socket OK" : "Socket KO"}
            </span>
            <span className="ml-3">Statut: {humanStatus}</span>
            {incoming ? (
              <span className="ml-3 text-zinc-400">
                Appel entrant de {incoming.callerName ?? `Utilisateur ${incoming.callerId}`}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-sm">
              UserId
              <input
                value={userId}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim() === "") return;
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n <= 0) return;
                  setUserId(n);
                }}
                className="h-9 w-20 rounded-md border border-white/10 bg-[#0f1623] px-2 text-zinc-100"
              />
            </label>

            <button
              type="button"
              onClick={() => setMicEnabled((v) => !v)}
              className="rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              {micEnabled ? "Mute" : "Unmute"}
            </button>
            <button
              type="button"
              onClick={() => setCamEnabled((v) => !v)}
              className="rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              {camEnabled ? "Cam off" : "Cam on"}
            </button>

            {!hasIncoming ? (
              <button
                type="button"
                onClick={() => startCall().catch((e) => alert(String(e?.message ?? e)))}
                disabled={!canStart}
                className="rounded-md bg-[#3b82f6] px-3 py-2 text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-50"
              >
                Appeler
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => acceptCall().catch((e) => alert(String(e?.message ?? e)))}
                  disabled={!canAccept}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Décrocher
                </button>

                <button
                  type="button"
                  onClick={() => declineCall().catch((e) => alert(String(e?.message ?? e)))}
                  disabled={!canAccept}
                  className="rounded-md bg-white/5 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/10 disabled:opacity-50"
                >
                  Refuser
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => hangup().catch((e) => alert(String(e?.message ?? e)))}
              disabled={!canHangup}
              className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
            >
              Raccrocher
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-zinc-400">
          Pour tester: ouvre cette page dans deux navigateurs, mets userId=1 d’un côté et userId=2 de l’autre, et lance l’appel.
        </div>
      </div>
    </div>
  );
}
