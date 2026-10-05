"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "seeker" | "runner";

type ChatMessage = {
  id: string;
  senderId: string;
  senderNickname: string;
  text: string;
  channel: "all" | "runners";
  createdAt: string;
};

type SessionView = {
  sessionCode: string;
  revealIntervalSeconds: number;
  nextRevealAt: string;
  countdownSec: number;
  viewer: {
    id: string;
    nickname: string;
    role: Role;
    isCreator: boolean;
  };
  players: {
    id: string;
    nickname: string;
    role: Role;
    color: string;
    lat: number | null;
    lng: number | null;
    delayed: boolean;
    lastActualAt: string | null;
    lastRevealedAt: string | null;
  }[];
  messages: ChatMessage[];
};

type AuthState = {
  sessionCode: string;
  playerId: string;
  nickname: string;
  role: Role;
};

function formatCoord(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(6);
}

export function TagGameClient() {
  const [nickname, setNickname] = useState("Игрок");
  const [role, setRole] = useState<Role>("runner");
  const [intervalSec, setIntervalSec] = useState(120);

  const [joinCode, setJoinCode] = useState("");

  const [auth, setAuth] = useState<AuthState | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [chatTab, setChatTab] = useState<"all" | "runners">("all");
  const [chatText, setChatText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  const storageKey = "tag-game-auth-v3";

  useEffect(() => {
    const raw = localStorage.getItem(storageKey) || localStorage.getItem("tag-game-auth-v2");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as AuthState;
      if (parsed?.sessionCode && parsed?.playerId && parsed.playerId !== parsed.sessionCode) {
        setAuth(parsed);
      } else {
        localStorage.removeItem(storageKey);
        localStorage.removeItem("tag-game-auth-v2");
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, []);

  async function createRoom(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          role,
          revealIntervalSeconds: intervalSec,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        sessionCode?: string;
        playerId?: string;
        nickname?: string;
        role?: Role;
      };

      if (!res.ok || !data.sessionCode || !data.playerId || !data.role || !data.nickname) {
        setError(data.error ?? "Не удалось создать комнату");
        return;
      }

      const newAuth: AuthState = {
        sessionCode: data.sessionCode,
        playerId: data.playerId,
        nickname: data.nickname,
        role: data.role,
      };

      localStorage.setItem(storageKey, JSON.stringify(newAuth));
      setAuth(newAuth);
      setJoinCode(data.sessionCode);
    } catch {
      setError("Сетевая ошибка при создании комнаты");
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("Укажите код комнаты");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, role }),
      });

      const data = (await res.json()) as {
        error?: string;
        sessionCode?: string;
        playerId?: string;
        nickname?: string;
        role?: Role;
      };

      if (!res.ok || !data.sessionCode || !data.playerId || !data.role || !data.nickname) {
        setError(data.error ?? "Не удалось войти в комнату");
        return;
      }

      const newAuth: AuthState = {
        sessionCode: data.sessionCode,
        playerId: data.playerId,
        nickname: data.nickname,
        role: data.role,
      };

      localStorage.setItem(storageKey, JSON.stringify(newAuth));
      setAuth(newAuth);
    } catch {
      setError("Сетевая ошибка при входе в комнату");
    } finally {
      setLoading(false);
    }
  }

  async function refreshSession() {
    if (!auth) return;
    if (auth.playerId === auth.sessionCode) {
      setAuth(null);
      setSession(null);
      localStorage.removeItem(storageKey);
      return;
    }

    try {
      const res = await fetch(
        `/api/sessions/${auth.sessionCode}?viewerId=${auth.playerId}`,
        { cache: "no-store" }
      );

      if (res.status === 404 || res.status === 403) {
        setAuth(null);
        setSession(null);
        localStorage.removeItem(storageKey);
        setError("Сессия истекла или была удалена. Создайте комнату заново.");
        return;
      }

      const data = (await res.json()) as SessionView & { error?: string };
      if (!res.ok) return;

      setSession(data);
      setError(null);
    } catch {
      // Игнорируем временные сетевые сбои
    }
  }

  useEffect(() => {
    if (!auth) return;

    void refreshSession();
    const timer = window.setInterval(() => {
      void refreshSession();
    }, 3000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshSession();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [auth]);

  useEffect(() => {
    if (!auth || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        void fetch(`/api/sessions/${auth.sessionCode}/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: auth.playerId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [auth]);

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!chatText.trim() || !auth || sendingMsg) return;

    setSendingMsg(true);
    try {
      const res = await fetch(`/api/sessions/${auth.sessionCode}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: auth.playerId,
          text: chatText,
          channel: chatTab,
        }),
      });

      if (res.ok) {
        setChatText("");
        await refreshSession();
      }
    } catch {
      // Игнорируем
    } finally {
      setSendingMsg(false);
    }
  }

  const isSeeker = session?.viewer.role === "seeker" || session?.viewer.role === "Вода";

  const filteredMessages = useMemo(() => {
    if (!session?.messages) return [];
    return session.messages.filter((m) => m.channel === chatTab);
  }, [session?.messages, chatTab]);

  const sortedPlayers = useMemo(() => {
    if (!session) return [];
    return [...session.players].sort((a, b) => {
      if (a.id === session.viewer.id) return -1;
      if (b.id === session.viewer.id) return 1;
      if (a.role === "seeker" && b.role !== "seeker") return -1;
      if (b.role === "seeker" && a.role !== "seeker") return 1;
      return a.nickname.localeCompare(b.nickname);
    });
  }, [session]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Tag Game</h1>
        <p className="mt-2 text-sm text-slate-600">
          Управление догонялками в реальном времени.
        </p>
      </header>

      {!auth ? (
        <section className="grid gap-4 md:grid-cols-2">
          <form onSubmit={createRoom} className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Создать комнату</h2>
            <label className="mt-4 block text-sm">Никнейм</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={40}
            />

            <label className="mt-4 block text-sm">Роль</label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="runner">Убегающий (runner)</option>
              <option value="seeker">Вода (seeker)</option>
            </select>

            <label className="mt-4 block text-sm">Интервал reveal (сек)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              min={10}
              max={3600}
            />

            <button
              disabled={loading}
              className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
            >
              {loading ? "Создаю..." : "Создать"}
            </button>
          </form>

          <form onSubmit={joinRoom} className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Войти в комнату</h2>
            <label className="mt-4 block text-sm">Код комнаты</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />

            <label className="mt-4 block text-sm">Никнейм</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={40}
            />

            <label className="mt-4 block text-sm">Роль</label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="runner">Убегающий (runner)</option>
              <option value="seeker">Вода (seeker)</option>
            </select>

            <button
              disabled={loading}
              className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
            >
              {loading ? "Вхожу..." : "Войти"}
            </button>
          </form>
        </section>
      ) : (
        <section className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Комната</p>
                <p className="text-xl font-semibold">{auth.sessionCode}</p>
                {session ? (
                  <p className="text-sm text-slate-600">
                    До следующего reveal: <strong>{session.countdownSec} сек</strong>
                  </p>
                ) : (
                  <p className="text-sm text-amber-600">Загрузка данных сессии...</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => void refreshSession()}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  Обновить
                </button>
                <button
                  onClick={() => {
                    setAuth(null);
                    setSession(null);
                    localStorage.removeItem(storageKey);
                  }}
                  className="rounded-lg bg-slate-200 px-3 py-2 text-sm"
                >
                  Выйти
                </button>
              </div>
            </div>

            {session ? (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2 pr-4">Игрок</th>
                      <th className="py-2 pr-4">Роль</th>
                      <th className="py-2 pr-4">Видимая Lat</th>
                      <th className="py-2 pr-4">Видимая Lng</th>
                      <th className="py-2 pr-4">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayers.map((player) => (
                      <tr key={player.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: player.color }}
                            />
                            {player.nickname}
                            {session.viewer.id === player.id ? <strong>(Вы)</strong> : null}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          {player.role === "seeker" || player.role === "Вода" ? "Вода" : "Убегающий"}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {formatCoord(player.lat)}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {formatCoord(player.lng)}
                        </td>
                        <td className="py-2 pr-4">
                          {player.delayed ? "Отложенные данные" : "Актуальные данные"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Чат</h2>

            <div className="flex gap-2 border-b pb-3 mb-4">
              <button
                onClick={() => setChatTab("all")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  chatTab === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                Общий чат
              </button>

              {!isSeeker ? (
                <button
                  onClick={() => setChatTab("runners")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    chatTab === "runners" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  Чат убегающих 🔒
                </button>
              ) : null}
            </div>

            <div className="h-48 overflow-y-auto border rounded-xl p-3 flex flex-col gap-2 mb-3 bg-slate-50">
              {filteredMessages.length === 0 ? (
                <p className="text-xs text-slate-400">Сообщений пока нет</p>
              ) : (
                filteredMessages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <span className="font-semibold text-slate-800">{msg.senderNickname}: </span>
                    <span className="text-slate-700">{msg.text}</span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={sendMessage} className="flex gap-2">
              <input
                className="flex-1 rounded-lg border px-3 py-2 text-sm"
                placeholder={
                  chatTab === "runners"
                    ? "Сообщение только для убегающих..."
                    : "Сообщение для всех..."
                }
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                maxLength={300}
              />
              <button
                disabled={sendingMsg || !chatText.trim() || !session}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Отправить
              </button>
            </form>
          </div>
        </section>
      )}

      {error ? (
        <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      ) : null}
    </main>
  );
}
