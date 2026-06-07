"use client";

/**
 * Identité déclarative de l'utilisateur connecté (POC, sans authentification
 * réelle). Stockée en sessionStorage : l'identité est PROPRE À CHAQUE ONGLET
 * (on peut donc être l'utilisateur 1 dans un onglet et l'utilisateur 2 dans un
 * autre), tout en survivant au rechargement du même onglet. Alimente les appels
 * REST (`x-requesting-user-id`) et le handshake WebSocket.
 */
export type Identity = { userId: number; name: string };

const KEY = "connectus.identity";

export function getIdentity(): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Identity;
    if (typeof parsed.userId !== "number" || typeof parsed.name !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setIdentity(identity: Identity): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}
