"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setIdentity } from "../lib/identity";

type UserCard = { id: number; firstName: string; lastName: string };

export default function LoginPage() {
  const router = useRouter();
  const [idValue, setIdValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    const n = Number(idValue);
    if (!Number.isInteger(n) || n <= 0) {
      setError("Entre un identifiant utilisateur valide.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/users/${n}/card`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setError("Aucun utilisateur ne correspond à cet identifiant.");
        return;
      }
      if (!res.ok) {
        setError(`Erreur serveur (${res.status}).`);
        return;
      }
      const card = (await res.json()) as UserCard;
      setIdentity({
        userId: card.id,
        name: `${card.firstName} ${card.lastName}`,
      });
      router.push("/chat");
    } catch {
      setError("Connexion au serveur impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[100svh] w-full items-center justify-center bg-[#0f1623] text-zinc-100">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#121a2a] p-6">
        <h1 className="text-xl font-semibold tracking-tight">Connect&apos;US</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Connecte-toi en saisissant ton identifiant utilisateur.
        </p>

        <label className="mt-6 grid gap-1 text-sm text-zinc-200">
          Identifiant utilisateur
          <input
            value={idValue}
            inputMode="numeric"
            placeholder="ex. 1"
            onChange={(e) => setIdValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) submit();
            }}
            className="h-11 rounded-md border border-white/10 bg-[#0f1623] px-3 text-zinc-100"
          />
        </label>

        {error ? (
          <div className="mt-3 rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => submit()}
          disabled={loading}
          className="mt-5 h-11 w-full rounded-md bg-[#3b82f6] text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-50"
        >
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </div>
    </div>
  );
}
