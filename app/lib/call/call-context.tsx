"use client";

import { createContext, useContext } from "react";

export type CallType = "VIDEO" | "AUDIO";

export type CallStatus =
  | "idle"
  | "ringing"
  | "incoming"
  | "active"
  | "declined"
  | "ended"
  | "error";

export type IncomingPayload = {
  callId: number;
  callerId: number;
  callerName?: string;
  type: CallType;
  conversationId: number;
};

export type CallContextValue = {
  status: CallStatus;
  socketConnected: boolean;
  incoming: IncomingPayload | null;
  /** Conversation à laquelle se rattache l'appel courant (ou entrant). */
  activeConversationId: number | null;
  callId: number | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micEnabled: boolean;
  camEnabled: boolean;
  startCall: (conversationId: number) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMic: () => void;
  toggleCam: () => void;
};

export const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCall doit être utilisé dans un <CallProvider>.");
  }
  return ctx;
}
