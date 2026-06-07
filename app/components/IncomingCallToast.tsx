"use client";

import { useRouter } from "next/navigation";
import { useCall } from "../lib/call/call-context";

/**
 * Notification d'appel entrant : non bloquante, fixée en haut de page, visible
 * partout dans l'app. Accepter téléporte vers le chat (la conversation est
 * sélectionnée côté chat) ; refuser décline l'appel.
 */
export function IncomingCallToast() {
  const router = useRouter();
  const { incoming, status, acceptCall, declineCall } = useCall();

  if (!incoming || status !== "incoming") return null;

  const callerLabel = incoming.callerName ?? `Utilisateur ${incoming.callerId}`;

  const onAccept = () => {
    router.push("/chat");
    acceptCall().catch((e) => alert(String(e?.message ?? e)));
  };

  const onDecline = () => {
    declineCall().catch((e) => alert(String(e?.message ?? e)));
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-white/10 bg-[#1a2436] px-4 py-3 text-zinc-100 shadow-lg">
        <div className="h-10 w-10 shrink-0 rounded-full bg-emerald-500/20" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">Appel entrant</div>
          <div className="truncate text-xs text-zinc-400">{callerLabel}</div>
        </div>
        <button
          type="button"
          onClick={onAccept}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Accepter
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
        >
          Refuser
        </button>
      </div>
    </div>
  );
}
