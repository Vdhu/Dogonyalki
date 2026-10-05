'use client';

import React, { useState, useEffect } from "react";

interface Player {
  id: string;
  nickname: string;
  role: string;
  color: string;
  actualLat: number;
  actualLng: number;
  revealedLat: number;
  revealedLng: number;
  lastActualAt: string;
  lastRevealedAt: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderNickname: string;
  text: string;
  channel: "all" | "runners";
  createdAt: string;
}

interface Session {
  code: string;
  creatorId: string;
  revealIntervalSeconds: number;
  nextRevealAt: string;
  players: Player[];
  messages: ChatMessage[];
  createdAt: string;
}

export function TagGameClient() {
  const [nickname, setNickname] = useState("Игрок");
  const [roomCode, setRoomCode] = useState("");
  const [revealInterval, setRevealInterval] = useState(300);

  const [auth, setAuth] = useState<{ roomCode: string; playerId: string } | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const [activeTab, setActiveTab] = useState<"players" | "chat" | "settings">("players");
  const [chatChannel, setChatChannel] = useState<"all" | "runners">("all");
  const [messageText, setMessageText] = useState("");
  const [gpsStatus, setGpsStatus] = useState("Инициализация...");
  const [failedAttempts, setFailedAttempts] = useState(0);

  const storageKey = "tag_game_auth_v6";

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.roomCode && parsed.playerId) {
          setAuth(parsed);
        }
      } catch (e) {
        console.error("Ошибка при чтении авторизации:", e);
      }
    }
  }, []);

  const saveAuth = (code: string, id: string) => {
    const data = { roomCode: code.trim().toUpperCase(), playerId: id };
    setAuth(data);
    localStorage.setItem(storageKey, JSON.stringify(data));
  };

  const clearAuth = () => {
    setAuth(null);
    setSession(null);
    localStorage.removeItem(storageKey);
  };

  const refreshSession = async () => {
    if (!auth) return;
    try {
      const res = await fetch(`/api/sessions/${auth.roomCode}?viewerId=${auth.playerId}`);
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        setFailedAttempts(0);
      } else if (res.status === 404) {
        setFailedAttempts((prev) => {
          const next = prev + 1;
          if (next >= 5) {
            setGpsStatus("Комната не найдена");
          }
          return next;
        });
      }
    } catch (e) {
      console.error("Ошибка обновления сессии:", e);
    }
  };

  useEffect(() => {
    if (!auth) return;

    void refreshSession();
    const timer = setInterval(() => {
      void refreshSession();
    }, 2000);

    return () => clearInterval(timer);
  }, [auth]);

  useEffect(() => {
    if (!auth || !("geolocation" in navigator)) {
      setGpsStatus("Геолокация недоступна");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGpsStatus(`GPS OK (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);

        void fetch(`/api/sessions/${auth.roomCode}/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: auth.playerId,
            lat: latitude,
            lng: longitude,
          }),
        });
      },
      (err) => {
        setGpsStatus(`Ошибка GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [auth]);

  const handleCreateRoom = async () => {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revealIntervalSeconds: revealInterval }),
      });

      if (!res.ok) return;
      const data = await res.json();

      const joinRes = await fetch(`/api/sessions/${data.code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname || "Создатель" }),
      });

      if (joinRes.ok) {
        const joinData = await joinRes.json();
        saveAuth(joinData.session.code, joinData.playerId);
      }
    } catch (e) {
      console.error("Ошибка создания комнаты:", e);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomCode) return;
    const cleanCode = roomCode.trim().toUpperCase();
    try {
      const res = await fetch(`/api/sessions/${cleanCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSSN.stringify({ nickname: nickname || "Игрок" }),
      });

      if (res.ok) {
        const data = await res.json();
        saveAuth(data.session.code, data.playerId);
      } else {
        alert("Не удалось войти. Проверьте код комнаты.");
      }
    } catch (e) {
      console.error("Ошибка входа:", e);
    }
  };

  const handleRoleChange = async (role: string) => {
    if (!auth) return;
    await fetch(`/api/sessions/${auth.roomCode}/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: auth.playerId, role }),
    });
    void refreshSession();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !messageText.trim()) return;

    await fetch(`/api/sessions/${auth.roomCode}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: auth.playerId,
        text: messageText,
        channel: chatChannel,
      }),
    });

    setMessageText("");
    void refreshSession();
  };

  if (!auth) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 p-6 rounded-2xl shadow-xl space-y-6">
          <h1 className="text-2xl font-bold text-center text-emerald-400">Догонялки GPS</h1>

          <div className="space-y-2">
            <label className="text-sm text-slate-400">Ваш никнейм</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full bg-slate-700 p-3 rounded-xl border border-slate-600 text-white focus:outline-none focus:border-emerald-400"
            />
          </div>

          <div className="border-t border-slate-700 pt-4 space-y-3">
            <h2 className="text-lg font-semibold">Присоединиться к игре</h2>
            <input
              type="text"
              placeholder="Код комнаты (напр. TAG-1234)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full bg-slate-700 p-3 rounded-xl border border-slate-600 text-white focus:outline-none focus:border-emerald-400"
            />
            <button
              onClick={handleJoinRoom}
              className="w-full bg-emerald-500 hover:bg-emerald-600 py-3 rounded-xl font-semibold transition"
            >
              Войти в комнату
            </button>
          </div>

          <div className="border-t border-slate-700 pt-4 space-y-3">
            <h2 className="text-lg font-semibold">Создать новую игру</h2>
            <div className="space-y-1">
              <label className="text-sm text-slate-400">Интервал раскрытия GPS (сек)</label>
              <input
                type="number"
                value={revealInterval}
                onChange={(e) => setRevealInterval(Number(e.target.value))}
                className="w-full bg-slate-700 p-3 rounded-xl border border-slate-600 text-white focus:outline-none focus:border-emerald-400"
              />
            </div>
            <button
              onClick={handleCreateRoom}
              className="w-full bg-indigo-600 hover:bg-indigo-700 py-3 rounded-xl font-semibold transition"
            >
              Создать комнату
            </button>
          </div>
        </div>
      </div>
    );
  }

  const me = session?.players.find((p) => p.id === auth.playerId);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center">
        <div>
          <span className="text-xs text-slate-400 block">Комната</span>
          <span className="text-xl font-extrabold text-emerald-400 tracking-wider">{auth.roomCode}</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400 block">Статус GPS</span>
          <span className="text-xs text-emerald-300">{gpsStatus}</span>
        </div>
        <button
          onClick={clearAuth}
          className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-3 py-1.5 rounded-lg text-sm hover:bg-rose-500/30 transition"
        >
          Выйти
        </button>
      </header>

      <div className="flex border-b border-slate-700 bg-slate-800/50">
        <button
          onClick={() => setActiveTab("players")}
          className={`flex-1 py-3 text-sm font-medium ${
            activeTab === "players" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-slate-400"
          }`}
        >
          Игроки ({session?.players.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 py-3 text-sm font-medium ${
            activeTab === "chat" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-slate-400"
          }`}
        >
          Чат ({session?.messages.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex-1 py-3 text-sm font-medium ${
            activeTab === "settings" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-slate-400"
          }`}
        >
          Настройки
        </button>
      </div>

      <main className="flex-1 p-4 overflow-y-auto">
        {activeTab === "players" && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Участники комнаты</h2>
            {session?.players.map((p) => (
              <div key={p.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="font-semibold">{p.nickname}</span>
                    {p.id === auth.playerId && <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">(Вы)</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Роль: <span className="text-emerald-300 capitalize">{p.role === "hunter" ? "Охотник" : "Убегающий"}</span>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div>Координаты:</div>
                  <div className="font-mono text-slate-200">
                    {p.revealedLat ? `${p.revealedLat.toFixed(4)}, ${p.revealedLng.toFixed(4)}` : "Ожидание..."}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "chat" && (
          <div className="flex flex-col h-full space-y-4">
            <div className="flex space-x-2 bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setChatChannel("all")}
                className={`flex-1 py-1.5 text-xs rounded-lg transition ${
                  chatChannel === "all" ? "bg-emerald-500 text-slate-950 font-bold" : "text-slate-400"
                }`}
              >
                Общий
              </button>
              <button
                onClick={() => setChatChannel("runners")}
                className={`flex-1 py-1.5 text-xs rounded-lg transition ${
                  chatChannel === "runners" ? "bg-emerald-500 text-slate-950 font-bold" : "text-slate-400"
                }`}
              >
                Убегающие
              </button>
            </div>

            <div className="flex-1 bg-slate-800 p-3 rounded-xl border border-slate-700 overflow-y-auto space-y-2 min-h-[300px]">
              {session?.messages
                .filter((m) => chatChannel === "all" || m.channel === chatChannel)
                .map((m) => (
                  <div key={m.id} className="bg-slate-700/50 p-2 rounded-lg text-sm">
                    <span className="font-bold text-emerald-400">{m.senderNickname}: </span>
                    <span>{m.text}</span>
                  </div>
                ))}
            </div>

            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                placeholder="Сообщение..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 p-3 rounded-xl text-white focus:outline-none"
              />
              <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 px-4 py-3 rounded-xl font-semibold">
                Отправить
              </button>
            </form>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
            <h2 className="text-lg font-semibold">Выбор роли</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleRoleChange("runner")}
                className={`p-3 rounded-xl font-semibold border ${
                  me?.role === "runner"
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                    : "bg-slate-700 border-slate-600 text-slate-300"
                }`}
              >
                Убегающий
              </button>
              <button
                onClick={() => handleRoleChange("hunter")}
                className={`p-3 rounded-xl font-semibold border ${
                  me?.role === "hunter"
                    ? "bg-rose-500/20 border-rose-400 text-rose-300"
                    : "bg-slate-700 border-slate-600 text-slate-300"
                }`}
              >
                Охотник
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
