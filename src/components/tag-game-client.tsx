"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "seeker" | "runner";

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

  const storageKey = "tag-game-auth-v2";

  // Восстановление авторизации при загрузке
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as AuthState;
      if (parsed?.sessionCode && parsed?.playerId) {
        setAuth(parsed);
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, []);

  // Сохранение авторизации
  useEffect(() => {
    if (!auth) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(auth));
  }, [auth]);

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
    // Читаем auth напрямую из localStorage на случай сброса стейта фоном
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    let currentAuth: AuthState;
    try {
      currentAuth = JSON.parse(raw);
    } catch {
      return;
    }

    if (!currentAuth?.sessionCode || !currentAuth?.playerId) return;

    try {
      const res = await fetch(
        `/api/sessions/${currentAuth.sessionCode}?viewerId=${currentAuth.playerId}`,
        { cache: "no-store" }
      );

      if (res.status === 404) {
        setError("Комната не найдена или её срок действия истёк");
        setAuth(null);
        setSession(null);
        localStorage.removeItem(storageKey);
        return;
      }

      const data = (await res.json()) as SessionView & { error?: string };

      if (!res.ok) {
        return; // Временный сбой — не трогаем сессию
      }

      setAuth(currentAuth);
      setSession(data);
      setError(null);
    } catch {
      // Игнорируем сетевые обрывы в фоне
    }
  }

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    void refreshSession();
    const timer = window.setInterval(() => {
      void refreshSession();
    }, 3000);

    // Перезапрос данных сразу, когда пользователь возвращается во вкладку из другого браузера
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
  }, []);

  async function sendCurrentLocation() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    let currentAuth: AuthState;
    try {
      currentAuth = JSON.parse(raw);
    } catch {
      return;
    }

    if (!navigator.geolocation) {
      setError("Геолокация недоступна в браузере");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        try {
          const res = await fetch(`/api/sessions/${currentAuth.sessionCode}/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              playerId: currentAuth.playerId,
              lat,
              lng,
            }),
          });

          const data = (await res.json()) as { error?: string };
          if (!res.ok) {
            setError(data.error ?? "Не удалось отправить геолокацию");
            return;
          }

          await refreshSession();
        } catch {
          setError("Сетевая ошибка при отправке геолокации");
        }
      },
      () => {
        setError("Нужен доступ к геолокации");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

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
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Комната</p>
              <p className="text-xl font-semibold">{auth.sessionCode}</p>
              {session ? (
                <p className="text-sm text-slate-600">
                  До следующего reveal: <strong>{session.countdownSec} сек</strong>
                </p>
              ) : null}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void refreshSession()}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Обновить
              </button>
              <button
                onClick={() => void sendCurrentLocation()}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white"
              >
                Отправить мою геопозицию
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
                        {session?.viewer.id === player.id ? <strong>(Вы)</strong> : null}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {player.role === "seeker" ? "Вода" : "Убегающий"}
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
        </section>
      )}

      {error ? (
        <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      ) : null}
    </main>
  );
}
