"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";

type Conversation = {
  id: number;
  otherParticipantId: number;
  lastMessage: null | {
    id: number;
    authorId: number;
    content: string;
    createdAt: string;
  };
};

type Message = {
  id: number;
  conversationId: number;
  authorId: number;
  content: string;
  responseToMessageId?: number | null;
  createdAt: string;
};

const backendWsBase = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5555";

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

function Icon({ name }: { name: "phone" | "search" | "bell" | "gear" | "send" | "smile" }) {
  const common = "h-5 w-5";
  switch (name) {
    case "phone":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M7 2h3l2 6-2 1c1 3 3 5 6 6l1-2 6 2v3c0 2-2 4-4 4C10 22 2 14 2 6c0-2 2-4 5-4Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "search":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "bell":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 22a2.5 2.5 0 0 0 2.45-2H9.55A2.5 2.5 0 0 0 12 22Z"
            fill="currentColor"
          />
          <path
            d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "gear":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M19.4 15a8.8 8.8 0 0 0 .1-1 8.8 8.8 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l-.4-2.6H9.1l-.4 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8.8 8.8 0 0 0-.1 1 8.8 8.8 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1l.4 2.6h5.8l.4-2.6a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "send":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M22 2 11 13"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M22 2 15 22l-4-9-9-4 20-7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "smile":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path d="M8.5 10h.01M15.5 10h.01" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
          <path
            d="M8 14c1 1.5 2.5 2.5 4 2.5S15 15.5 16 14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

async function apiFetch(path: string, init: RequestInit & { requestingUserId: number }) {
  const { requestingUserId, ...rest } = init;
  return fetch(path, {
    ...rest,
    headers: {
      ...(rest.headers ?? {}),
      "x-requesting-user-id": String(requestingUserId),
    },
  });
}

export default function ChatPage() {
  const router = useRouter();
  const [requestingUserId, setRequestingUserId] = useState<number>(1);
  const [targetUserId, setTargetUserId] = useState<number>(2);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState("/connectus-logo.png");
  const [logoMissing, setLogoMissing] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [messageMenuOpenId, setMessageMenuOpenId] = useState<number | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messageContent, setMessageContent] = useState<string>("");

  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedConversationIdRef = useRef<number | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  async function loadConversations(userId: number) {
    const res = await apiFetch("/api/conversations", {
      requestingUserId: userId,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Impossible de charger les conversations (${res.status})${text ? `: ${text}` : ""}`);
    }

    const data = (await res.json()) as Conversation[];
    setConversations(data);
  }

  async function loadMessages(userId: number, conversationId: number) {
    const res = await apiFetch(`/api/conversations/${conversationId}/messages`, {
      requestingUserId: userId,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Impossible de charger les messages (${res.status})${text ? `: ${text}` : ""}`);
    }

    const data = (await res.json()) as Message[];
    setMessages(data);
  }

  async function createConversation() {
    const res = await apiFetch("/api/conversations", {
      requestingUserId,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Création conversation impossible (${res.status})${text ? `: ${text}` : ""}`);
    }

    const conversation = (await res.json()) as Conversation;
    await loadConversations(requestingUserId);
    setSelectedConversationId(conversation.id);
    await loadMessages(requestingUserId, conversation.id);
  }

  async function sendMessageRest() {
    if (!selectedConversationId) return;

    const res = await apiFetch(`/api/conversations/${selectedConversationId}/messages`, {
      requestingUserId,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: messageContent }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Envoi message impossible (${res.status})${text ? `: ${text}` : ""}`);
    }

    setMessageContent("");
    await loadMessages(requestingUserId, selectedConversationId);
  }

  async function sendMessageWs() {
    if (!socketRef.current) {
      throw new Error("Connexion temps réel indisponible.");
    }

    if (!socketConnected) {
      throw new Error("Connexion WebSocket non établie.");
    }

    if (!messageContent.trim()) return;

    let conversationId = selectedConversationId;

    if (conversationId === null) {
      const res = await apiFetch("/api/conversations", {
        requestingUserId,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Impossible de créer une conversation (${res.status})${text ? `: ${text}` : ""}`,
        );
      }
      const conversation = (await res.json()) as Conversation;
      await loadConversations(requestingUserId);
      conversationId = conversation.id;
      setSelectedConversationId(conversationId);
    }

    const content = messageContent;
    setMessageContent("");

    await new Promise<void>((resolve, reject) => {
      socketRef.current?.emit(
        "send",
        {
          conversationId,
          content,
        },
        (ack: unknown) => {
          if (ack && typeof ack === "object" && "error" in (ack as Record<string, unknown>)) {
            reject(new Error(String((ack as { error: unknown }).error)));
            return;
          }
          resolve();
        },
      );
    });
  }

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    setMessages([]);
    setSelectedConversationId(null);
    setConversations([]);
    loadConversations(requestingUserId).catch((e) => {
      console.error(e);
    });
  }, [requestingUserId]);

  useEffect(() => {
    if (selectedConversationId !== null) return;
    if (conversations.length === 0) return;
    const first = conversations[0];
    setSelectedConversationId(first.id);
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(requestingUserId, selectedConversationId).catch((e) => {
        console.error(e);
      });
    }
  }, [requestingUserId, selectedConversationId]);

  useEffect(() => {
    const url = `${backendWsBase()}/chat`;
    const socket = io(url, {
      auth: { userId: requestingUserId },
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
    });

    socket.on("message:new", (msg: Message) => {
      const currentConversationId = selectedConversationIdRef.current;
      setMessages((prev) => {
        if (!currentConversationId) return prev;
        if (msg.conversationId !== currentConversationId) return prev;
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.conversationId
            ? {
                ...c,
                lastMessage: {
                  id: msg.id,
                  authorId: msg.authorId,
                  content: msg.content,
                  createdAt: msg.createdAt,
                },
              }
            : c,
        ),
      );
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [requestingUserId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const displayName = selectedConversation ? `Utilisateur ${selectedConversation.otherParticipantId}` : "Messagerie";

  const goUnavailable = (name: string) => {
    router.push(`/unavailable?feature=${encodeURIComponent(name)}`);
  };

  const emojis = ["😀", "😂", "😍", "😅", "😉", "😎", "😭", "😡", "👍", "🙏", "🎉", "🔥", "❤️", "✅", "⭐"];

  const insertEmoji = (e: string) => {
    setMessageContent((prev) => `${prev}${e}`);
    setEmojiOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="h-[100svh] w-full bg-[#0f1623] text-zinc-100">
      <div className="flex h-full w-full">
        <aside className="w-[260px] shrink-0 border-r border-white/10 bg-[#121a2a]">
          <Link
            href="/"
            className="flex h-14 items-center gap-3 border-b border-white/10 px-4 hover:bg-white/5"
          >
            <img
              src={logoSrc}
              alt="ConnectUS"
              width={28}
              height={28}
              className="h-7 w-7 rounded-full object-cover opacity-95"
              onError={() => {
                setLogoMissing(true);
                setLogoSrc("/globe.svg");
              }}
            />
            <div className="text-lg font-semibold tracking-tight">Connect&apos;US</div>
          </Link>

          {logoMissing ? (
            <div className="px-4 pt-2 text-[11px] text-zinc-400">
              Ajoute <span className="text-zinc-200">public/connectus-logo.png</span> pour afficher le logo.
            </div>
          ) : null}

          <nav className="px-3 py-3 text-sm">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-zinc-200 hover:bg-white/5"
            >
              <span className="h-2 w-2 rounded-full bg-zinc-400" />
              Accueil
            </Link>
            <Link
              href="/chat"
              className="mt-1 flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-zinc-100"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Messages privés
            </Link>
            <button
              type="button"
              onClick={() => goUnavailable("Serveurs favoris")}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-zinc-200 hover:bg-white/5"
            >
              <span className="h-2 w-2 rounded-full bg-zinc-400" />
              Serveurs favoris
              <span className="ml-auto text-zinc-400">▾</span>
            </button>
          </nav>

          <div className="px-3">
            <div className="rounded-lg bg-white/5 p-2">
              <div className="space-y-1 text-sm">
                {[
                  { name: "L3 EPSI" },
                  { name: "M1 EPSI" },
                  { name: "M2 EPSI" },
                ].map((s) => (
                  <button
                    type="button"
                    onClick={() => goUnavailable(s.name)}
                    key={s.name}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-white/5"
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500/40 to-emerald-500/30" />
                    <div className="flex-1">
                      <div className="leading-5 text-zinc-100">{s.name}</div>
                    </div>
                    <div className="text-zinc-400">›</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 px-3">
            <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
              <span>Conversations</span>
              <button
                type="button"
                onClick={() => loadConversations(requestingUserId).catch((e) => alert(String(e.message ?? e)))}
                className="rounded px-2 py-1 hover:bg-white/5"
              >
                ↻
              </button>
            </div>

            <div className="mt-2 space-y-2">
              <button
                type="button"
                onClick={() => {
                  createConversation().catch((e) => alert(String(e.message ?? e)));
                }}
                className="w-full rounded-md bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
              >
                Nouvelle conversation
              </button>

              <div className="space-y-1">
                {conversations.map((c) => {
                  const active = c.id === selectedConversationId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedConversationId(c.id);
                        loadMessages(requestingUserId, c.id).catch((e) =>
                          alert(String(e?.message ?? e)),
                        );
                      }}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        active ? "bg-white/10" : "hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-white/10" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-zinc-100">
                            Utilisateur {c.otherParticipantId}
                          </div>
                          <div className="truncate text-xs text-zinc-400">
                            {c.lastMessage?.content ?? "Aucun message"}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {conversations.length === 0 ? (
                  <div className="rounded-md bg-white/5 px-3 py-2 text-sm text-zinc-300">
                    Aucune conversation
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-auto px-3 pb-4 pt-6">
            <div className="rounded-lg bg-white/5 p-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/10" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">Moi</div>
                  <div className="text-xs text-zinc-400">Utilisateur {requestingUserId}</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#0f1623]">
          <header className="flex h-14 items-center justify-between border-b border-white/10 bg-[#1a2436] px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-white/10" />
              <div className="font-medium">{displayName}</div>
              <div
                className={`ml-2 inline-flex items-center gap-2 rounded-full px-2 py-1 text-[11px] ${
                  socketConnected ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"
                }`}
                title={socketConnected ? "Connecté" : "Déconnecté"}
              >
                <span className={`h-2 w-2 rounded-full ${socketConnected ? "bg-emerald-400" : "bg-amber-400"}`} />
                {socketConnected ? "En ligne" : "Hors ligne"}
              </div>
            </div>
            <div className="flex items-center gap-3 text-zinc-200">
              <button
                type="button"
                className="rounded-md p-2 hover:bg-white/5"
                aria-label="Appel"
                onClick={() => goUnavailable("Appel")}
              >
                <Icon name="phone" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 hover:bg-white/5"
                aria-label="Rechercher"
                onClick={() => goUnavailable("Recherche")}
              >
                <Icon name="search" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 hover:bg-white/5"
                aria-label="Notifications"
                onClick={() => goUnavailable("Notifications")}
              >
                <Icon name="bell" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 hover:bg-white/5"
                aria-label="Réglages"
                onClick={() => setSettingsOpen(true)}
              >
                <Icon name="gear" />
              </button>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-auto px-5 py-5" ref={listRef}>
              <div className="text-center text-sm text-zinc-400">Début de la conversation</div>

              <div className="mt-6 space-y-4">
                {messages.map((m) => {
                  const mine = m.authorId === requestingUserId;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-start gap-3 ${mine ? "justify-end" : "justify-start"}`}
                    >
                      {!mine ? <div className="mt-1 h-10 w-10 rounded-full bg-white/10" /> : null}

                      <div
                        className={`max-w-[760px] rounded-xl bg-[#2a3446] px-4 py-3 shadow-sm ${
                          mine ? "" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className={`text-sm font-medium ${mine ? "text-emerald-300" : "text-emerald-300"}`}>
                            {mine ? "Moi" : `Utilisateur ${m.authorId}`}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-zinc-400">{formatTime(m.createdAt)}</div>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setMessageMenuOpenId((cur) => (cur === m.id ? null : m.id))}
                                className="rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"
                                aria-label="Actions message"
                              >
                                ⋯
                              </button>

                              {messageMenuOpenId === m.id ? (
                                <div className="absolute right-0 top-8 z-10 w-44 rounded-lg border border-white/10 bg-[#121a2a] p-1 shadow-lg">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMessageMenuOpenId(null);
                                      goUnavailable("Suppression de message");
                                    }}
                                    className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5"
                                  >
                                    Supprimer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setMessageMenuOpenId(null)}
                                    className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5"
                                  >
                                    Fermer
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-100">
                          {m.content}
                        </div>
                      </div>

                      {mine ? <div className="mt-1 h-10 w-10 rounded-full bg-white/10" /> : null}
                    </div>
                  );
                })}

                {selectedConversationId === null ? (
                  <div className="rounded-lg bg-white/5 px-4 py-3 text-sm text-zinc-300">
                    Sélectionne une conversation à gauche.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-white/10 bg-[#1a2436] px-4 py-4">
              <div className="flex items-center gap-3 rounded-xl bg-[#2a3446] px-4 py-3">
                <div className="relative">
                  <button
                    type="button"
                    className="rounded-md p-1 text-zinc-300 hover:bg-white/5"
                    aria-label="Emoji"
                    onClick={() => setEmojiOpen((v) => !v)}
                  >
                  <Icon name="smile" />
                  </button>

                  {emojiOpen ? (
                    <div className="absolute bottom-12 left-0 w-56 rounded-xl border border-white/10 bg-[#121a2a] p-2 shadow-lg">
                      <div className="grid grid-cols-5 gap-1">
                        {emojis.map((emo) => (
                          <button
                            key={emo}
                            type="button"
                            onClick={() => insertEmoji(emo)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg hover:bg-white/5"
                            aria-label={`Emoji ${emo}`}
                          >
                            {emo}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEmojiOpen(false)}
                        className="mt-2 w-full rounded-md px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
                      >
                        Fermer
                      </button>
                    </div>
                  ) : null}
                </div>

                <input
                  ref={inputRef}
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="écrivez un message..."
                  className="h-10 w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!messageContent.trim() || !selectedConversationId) return;
                      sendMessageWs().catch((err) => alert(String(err?.message ?? err)));
                    }
                  }}
                />

                <button
                  type="button"
                  onClick={() => sendMessageWs().catch((e) => alert(String(e.message ?? e)))}
                  className="flex h-10 w-10 items-center justify-center rounded-md bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50"
                  disabled={!messageContent.trim()}
                  aria-label="Envoyer"
                >
                  <Icon name="send" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {settingsOpen ? (
          <div className="fixed inset-0 z-50 flex">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              onClick={() => setSettingsOpen(false)}
              aria-label="Fermer"
            />
            <div className="relative ml-auto h-full w-full max-w-md border-l border-white/10 bg-[#121a2a] p-5">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">Réglages</div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-md px-3 py-2 text-sm hover:bg-white/5"
                >
                  Fermer
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-1 text-sm text-zinc-200">
                  Mon utilisateur (userId)
                  <input
                    value={requestingUserId}
                    onChange={(e) => setRequestingUserId(Number(e.target.value || 0))}
                    className="h-11 rounded-md border border-white/10 bg-[#0f1623] px-3 text-zinc-100"
                  />
                </label>

                <label className="grid gap-1 text-sm text-zinc-200">
                  Interlocuteur (targetUserId)
                  <input
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(Number(e.target.value || 0))}
                    className="h-11 rounded-md border border-white/10 bg-[#0f1623] px-3 text-zinc-100"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    createConversation().catch((e) => alert(String(e.message ?? e)));
                    setSettingsOpen(false);
                  }}
                  className="h-11 rounded-md bg-[#3b82f6] px-4 text-sm font-medium text-white hover:bg-[#2563eb]"
                >
                  Démarrer une conversation
                </button>

                <div className="rounded-md bg-white/5 p-3 text-xs text-zinc-300">
                  Pour la démo, tu peux changer ici l&apos;utilisateur courant et l&apos;interlocuteur.
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
