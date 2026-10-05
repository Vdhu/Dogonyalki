"use client";

import "leaflet/dist/leaflet.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

type Role = "seeker" | "runner";

type AuthState = {
  sessionCode: string;
  playerId: string;
  nickname: string;
  role: Role;
  isCreator: boolean;
};

type SessionPlayer = {
  id: string;
  nickname: string;
  role: Role;
  color: string;
  lat: number | null;
  lng: number | null;
  delayed: boolean;
  lastActualAt: string | null;
  lastRevealedAt: string | null;
};

type SessionState = {
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
  players: SessionPlayer[];
};

const STORAGE_KEY = "tag-game-auth";

// @ts-expect-error private Leaflet API override
if (L.Icon.Default.prototype._getIconUrl) {
  // @ts-expect-error private Leaflet API override
  delete L.Icon.Default.prototype._getIconUrl;
}

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

async function readJsonSafe<T>(response: Response) {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Сервер вернул некорректный JSON");
  }
}

async function postJson<T>(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJsonSafe<T & { error?: string }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? "Ошибка запроса");
  }
  return data;
}

function MapController({ points }: { points: [number, number][] }) {
  const map = useMap();
  const hasInitializedViewRef = useRef(false);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      map.invalidateSize();
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [map, points.length]);

  useEffect(() => {
    if (points.length === 0) return;

    if (!hasInitializedViewRef.current) {
      hasInitializedViewRef.current = true;

      if (points.length === 1) {
        map.setView(points[0], Math.max(map.getZoom(), 14));
        return;
      }

      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
      return;
    }

    const currentCenter = map.getCenter();
    const nearest = points.reduce(
      (acc, point) => {
        const dist = Math.hypot(point[0] - currentCenter.lat, point[1] - currentCenter.lng);
        if (dist < acc.dist) {
          return { point, dist };
        }
        return acc;
      },
      { point: points[0], dist: Number.POSITIVE_INFINITY },
    );

    if (nearest.dist > 0.02) {
      map.panTo(nearest.point, { animate: true, duration: 0.5 });
    }
  }, [map, points]);

  return null;
}

function parseMinutesInput(input: string) {
  const normalized = input.replace(",", ".").trim();
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Интервал должен быть положительным числом минут");
  }
  return value;
}

export default function TagGameApp() {
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<Role>("runner");
  const [sessionCodeInput, setSessionCodeInput] = useState("");
  const [intervalMinutesInput, setIntervalMinutesInput] = useState<string>("2");

  const [auth, setAuth] = useState<AuthState | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [countdown, setCountdown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string>("Геолокация не запрошена");

  const fetchInFlightRef = useRef(false);
  const gpsSendInFlightRef = useRef(false);
  const gpsLastSentAtRef = useRef(0);
  const lastStateRefreshAfterGpsRef = useRef(0);

  const knownMarkers = useMemo(
    () => sessionState?.players.filter((player) => player.lat !== null && player.lng !== null) ?? [],
    [sessionState],
  );

  const mapPoints = useMemo<[number, number][]>(() => {
    return knownMarkers.map((p) => [p.lat as number, p.lng as number]);
  }, [knownMarkers]);

  const persistAuth = useCallback((nextAuth: AuthState | null) => {
    setAuth(nextAuth);
    if (!nextAuth) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAuth));
  }, []);

  const loadState = useCallback(
    async (targetAuth: AuthState) => {
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;

      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(targetAuth.sessionCode)}?viewerId=${encodeURIComponent(targetAuth.playerId)}`,
          { cache: "no-store" },
        );

        const data = await readJsonSafe<SessionState & { error?: string }>(response);
        if (!response.ok) {
          throw new Error(data.error ?? "Не удалось получить состояние комнаты");
        }

        setSessionState(data);
        setCountdown(data.countdownSec);

        const nextAuth: AuthState = {
          ...targetAuth,
          role: data.viewer.role,
          isCreator: data.viewer.isCreator,
        };

        if (nextAuth.role !== targetAuth.role || nextAuth.isCreator !== targetAuth.isCreator) {
          persistAuth(nextAuth);
        }
      } finally {
        fetchInFlightRef.current = false;
      }
    },
    [persistAuth],
  );

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const restored = JSON.parse(raw) as AuthState;
      setAuth(restored);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!auth) return;

    let cancelled = false;

    const tick = async () => {
      try {
        await loadState(auth);
        if (!cancelled) {
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Ошибка загрузки состояния";
          setError(message);
          if (message.includes("не участник") || message.includes("Комната не найдена")) {
            setSessionState(null);
            persistAuth(null);
          }
        }
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auth, loadState, persistAuth]);

  useEffect(() => {
    if (!sessionState?.nextRevealAt) {
      setCountdown(0);
      return;
    }

    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((new Date(sessionState.nextRevealAt).getTime() - Date.now()) / 1000));
      setCountdown(remaining);
    }, 500);

    return () => window.clearInterval(timer);
  }, [sessionState?.nextRevealAt]);

  useEffect(() => {
    if (!sessionState) return;
    setIntervalMinutesInput(String(sessionState.revealIntervalSeconds / 60));
  }, [sessionState?.revealIntervalSeconds]);

  useEffect(() => {
    if (!auth) return;
    if (!navigator.geolocation) {
      setGeoStatus("Геолокация недоступна в этом браузере");
      return;
    }

    let cancelled = false;
    setGeoStatus("Запрос GPS…");

    const syncPosition = async (position: GeolocationPosition, force = false) => {
      const now = Date.now();
      if (!force && (now - gpsLastSentAtRef.current < 1000 || gpsSendInFlightRef.current)) {
        return;
      }

      gpsSendInFlightRef.current = true;
      const lat = Number(position.coords.latitude.toFixed(6));
      const lng = Number(position.coords.longitude.toFixed(6));

      try {
        await postJson<{ ok: true }>(`/api/sessions/${encodeURIComponent(auth.sessionCode)}/location`, {
          playerId: auth.playerId,
          lat,
          lng,
        });

        gpsLastSentAtRef.current = now;

        if (!cancelled) {
          setGeoStatus(`GPS синхронизирован: ${lat}, ${lng}`);
        }

        if (now - lastStateRefreshAfterGpsRef.current > 1000) {
          lastStateRefreshAfterGpsRef.current = now;
          await loadState(auth);
        }
      } catch (err) {
        if (!cancelled) {
          setGeoStatus(err instanceof Error ? err.message : "Ошибка отправки GPS");
        }
      } finally {
        gpsSendInFlightRef.current = false;
      }
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void syncPosition(position, true);
      },
      (geoError) => {
        if (!cancelled) {
          setGeoStatus(`Ошибка GPS: ${geoError.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20_000,
      },
    );

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        void syncPosition(position);
      },
      (geoError) => {
        if (!cancelled) {
          setGeoStatus(`Ошибка GPS: ${geoError.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3_000,
        timeout: 20_000,
      },
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [auth, loadState]);

  const onCreateSession = async () => {
    try {
      setLoading(true);
      setError(null);

      const mins = parseMinutesInput(intervalMinutesInput);
      const revealIntervalSeconds = mins * 60;

      const created = await postJson<AuthState & { revealIntervalSeconds: number }>("/api/sessions", {
        nickname,
        role,
        revealIntervalSeconds,
      });

      const nextAuth: AuthState = {
        sessionCode: created.sessionCode,
        playerId: created.playerId,
        nickname: created.nickname,
        role: created.role,
        isCreator: created.isCreator,
      };

      persistAuth(nextAuth);
      setIntervalMinutesInput(String(created.revealIntervalSeconds / 60));
      await loadState(nextAuth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания комнаты");
    } finally {
      setLoading(false);
    }
  };

  const onJoinSession = async () => {
    try {
      setLoading(true);
      setError(null);

      const joined = await postJson<AuthState & { revealIntervalSeconds: number }>("/api/sessions/join", {
        code: sessionCodeInput,
        nickname,
        role,
      });

      const nextAuth: AuthState = {
        sessionCode: joined.sessionCode,
        playerId: joined.playerId,
        nickname: joined.nickname,
        role: joined.role,
        isCreator: joined.isCreator,
      };

      persistAuth(nextAuth);
      setIntervalMinutesInput(String(joined.revealIntervalSeconds / 60));
      await loadState(nextAuth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа в комнату");
    } finally {
      setLoading(false);
    }
  };

  const onChangeInterval = async () => {
    if (!auth?.isCreator) return;

    try {
      setLoading(true);
      setError(null);

      const mins = parseMinutesInput(intervalMinutesInput);
      const revealIntervalSeconds = mins * 60;

      const response = await fetch(`/api/sessions/${encodeURIComponent(auth.sessionCode)}/interval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: auth.playerId,
          revealIntervalSeconds,
        }),
      });

      const data = await readJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Ошибка смены интервала");
      }

      await loadState(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка смены интервала");
    } finally {
      setLoading(false);
    }
  };

  const onTransferSeeker = async (targetPlayerId: string, targetRole: Role) => {
    if (!auth || !sessionState) return;

    if (sessionState.viewer.role !== "seeker") {
      setError("Передавать роль может только текущая Вода");
      return;
    }

    if (targetRole === "seeker") {
      setError("Этот игрок уже Вода");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/sessions/${encodeURIComponent(auth.sessionCode)}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorId: auth.playerId,
          targetPlayerId,
        }),
      });

      const data = await readJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Ошибка передачи роли");
      }

      await loadState(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка передачи роли");
    } finally {
      setLoading(false);
    }
  };

  const onLeave = async () => {
    if (auth) {
      try {
        await fetch(`/api/sessions/${encodeURIComponent(auth.sessionCode)}?viewerId=${encodeURIComponent(auth.playerId)}`, {
          method: "DELETE",
        });
      } catch {
        // ignore intentionally
      }
    }

    setSessionState(null);
    setCountdown(0);
    persistAuth(null);
    setGeoStatus("Геолокация не запрошена");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
        <header className="rounded-2xl bg-slate-900/70 p-5 ring-1 ring-white/10">
          <h1 className="text-2xl font-bold md:text-3xl">Игра в догонялки: Вода и Убегающие</h1>
          <p className="mt-2 text-sm text-slate-300">
            Убегающие отправляют GPS, а Вода видит точки по таймеру. Нажмите на карточку другого игрока, чтобы передать
            роль Воды.
          </p>
        </header>

        {!auth && (
          <section className="grid gap-4 rounded-2xl bg-slate-900/70 p-5 ring-1 ring-white/10 md:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Профиль игрока</h2>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ваш никнейм"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              >
                <option value="runner">Убегающий</option>
                <option value="seeker">Вода</option>
              </select>
            </div>

            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border border-slate-700 p-3">
                <h3 className="font-medium">Создать комнату</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    min="0.000001"
                    value={intervalMinutesInput}
                    onChange={(e) => setIntervalMinutesInput(e.target.value)}
                    placeholder="Интервал (минут)"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                  />
                  <span className="whitespace-nowrap text-sm text-slate-400">минут</span>
                </div>
                <button
                  type="button"
                  disabled={loading || !nickname.trim()}
                  onClick={onCreateSession}
                  className="w-full rounded-lg bg-emerald-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-60"
                >
                  Создать
                </button>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-700 p-3">
                <h3 className="font-medium">Войти в комнату</h3>
                <input
                  value={sessionCodeInput}
                  onChange={(e) => setSessionCodeInput(e.target.value.toUpperCase())}
                  placeholder="Код, например TAG-8392"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 uppercase"
                />
                <button
                  type="button"
                  disabled={loading || !nickname.trim() || !sessionCodeInput.trim()}
                  onClick={onJoinSession}
                  className="w-full rounded-lg bg-blue-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-60"
                >
                  Подключиться
                </button>
              </div>
            </div>
          </section>
        )}

        {auth && sessionState && (
          <>
            <section className="grid gap-3 rounded-2xl bg-slate-900/70 p-5 ring-1 ring-white/10 md:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Комната</p>
                <p className="text-lg font-bold">{sessionState.sessionCode}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Вы</p>
                <p className="text-lg font-bold">
                  {sessionState.viewer.nickname} · {sessionState.viewer.role === "seeker" ? "Вода" : "Убегающий"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Следующий слив GPS</p>
                <p className="text-lg font-bold">{countdown} сек</p>
              </div>
              <div className="flex items-end justify-end">
                <button type="button" onClick={() => void onLeave()} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">
                  Выйти
                </button>
              </div>
            </section>

            {sessionState.viewer.isCreator && (
              <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/10">
                <span className="text-sm text-slate-300">Интервал слива координат (минут):</span>
                <input
                  type="number"
                  step="any"
                  min="0.000001"
                  value={intervalMinutesInput}
                  onChange={(e) => setIntervalMinutesInput(e.target.value)}
                  className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void onChangeInterval()}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                >
                  Применить
                </button>
              </section>
            )}

            <div className="relative z-0 h-[450px] w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/70">
              <MapContainer center={[53.644, 23.872]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController points={mapPoints} />

                {knownMarkers.map((player) => (
                  <CircleMarker
                    key={`${player.id}:${player.lat}:${player.lng}`}
                    center={[player.lat as number, player.lng as number]}
                    radius={10}
                    pathOptions={{
                      color: player.color,
                      fillColor: player.color,
                      fillOpacity: 0.85,
                      weight: 2,
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -8]}>
                      {player.nickname} · {player.role === "seeker" ? "Вода" : "Убегающий"}
                      {player.delayed ? " · задержанная метка" : ""}
                    </Tooltip>
                    <Popup>
                      <strong>{player.nickname}</strong>
                      <br />
                      Роль: {player.role === "seeker" ? "Вода" : "Убегающий"}
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            <section className="space-y-4 rounded-2xl bg-slate-900/70 p-5 ring-1 ring-white/10">
              <h2 className="text-xl font-bold">Игроки ({sessionState.players.length})</h2>
              <p className="text-xs text-slate-400">
                Передавать роль Воды можно только если вы сейчас Вода: нажмите на карточку другого игрока.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {sessionState.players.map((p) => {
                  const isMe = p.id === auth.playerId;
                  const canTransfer = !isMe && sessionState.viewer.role === "seeker";

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => canTransfer && void onTransferSeeker(p.id, p.role)}
                      disabled={!canTransfer || loading}
                      className={`flex items-center gap-3 rounded-xl bg-slate-950 p-3 text-left ring-1 ring-white/5 transition ${
                        canTransfer ? "cursor-pointer hover:bg-slate-900 hover:ring-emerald-500/50" : "cursor-not-allowed opacity-80"
                      }`}
                    >
                      <div className="h-4 w-4 rounded-full" style={{ backgroundColor: p.color }} />
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate font-medium">
                          {p.nickname} {isMe ? "(Вы)" : ""}
                        </p>
                        <p className="text-xs text-slate-400">{p.role === "seeker" ? "Вода 🎯" : "Убегающий"}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {error && <div className="rounded-xl bg-red-500/20 p-4 text-red-200">{error}</div>}
        <div className="text-sm text-slate-400">Статус GPS: {geoStatus}</div>
      </div>
    </main>
  );
}
