import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "https://champion-tahr-200355.upstash.io",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "gQAAAAAAAw6jAAIgcDFkYWU1NjY3MzI0ODE0YmYzYWUzMmVkZTQ0ZDY5NWU2ZQ",
});

export interface Player {
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

export interface Session {
  code: string;
  creatorId: string;
  revealIntervalSeconds: number;
  nextRevealAt: string;
  players: Player[];
  createdAt: string;
}

function getRoomKey(code: string): string {
  return `room:${code.trim().toUpperCase()}`;
}

export async function getSession(code: string): Promise<Session | null> {
  try {
    const raw = await redis.get<string | Session>(getRoomKey(code));
    if (!raw) return null;
    if (typeof raw === "string") {
      return JSON.parse(raw) as Session;
    }
    return raw as Session;
  } catch (e) {
    console.error("Error getting session from Redis:", e);
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  try {
    const data = JSON.stringify(session);
    await redis.set(getRoomKey(session.code), data, { ex: 86400 });
  } catch (e) {
    console.error("Error saving session to Redis:", e);
  }
}

export async function createSession(data: {
  creatorNickname: string;
  role: string;
  revealIntervalSeconds?: number;
}) {
  try {
    const code = "TAG-" + Math.floor(1000 + Math.random() * 9000);
    const playerId = "p_" + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();

    const creator: Player = {
      id: playerId,
      nickname: data.creatorNickname,
      role: data.role,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      actualLat: 0,
      actualLng: 0,
      revealedLat: 0,
      revealedLng: 0,
      lastActualAt: now,
      lastRevealedAt: now,
    };

    const interval = data.revealIntervalSeconds || 60;
    const session: Session = {
      code,
      creatorId: playerId,
      revealIntervalSeconds: interval,
      nextRevealAt: new Date(Date.now() + interval * 1000).toISOString(),
      players: [creator],
      createdAt: now,
    };

    await saveSession(session);
    return { ok: true, code, playerId };
  } catch (e) {
    return { ok: false, error: "Ошибка создания комнаты" };
  }
}

export async function joinSession(code: string, nickname: string, role: string) {
  try {
    const session = await getSession(code);
    if (!session) return { ok: false, error: "Комната не найдена" };

    const playerId = "p_" + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();

    const newPlayer: Player = {
      id: playerId,
      nickname,
      role,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      actualLat: 0,
      actualLng: 0,
      revealedLat: 0,
      revealedLng: 0,
      lastActualAt: now,
      lastRevealedAt: now,
    };

    session.players.push(newPlayer);
    await saveSession(session);
    return { ok: true, code: session.code, playerId };
  } catch (e) {
    return { ok: false, error: "Ошибка подключения" };
  }
}

export async function getSessionState(code: string, viewerId: string) {
  try {
    const session = await getSession(code);
    if (!session) {
      return { ok: false, reason: { status: 404, error: "Комната не найдена" } };
    }

    const viewer = session.players.find((p) => p.id === viewerId);
    if (!viewer) {
      return { ok: false, reason: { status: 403, error: "Игрок не найден в комнате" } };
    }

    const nextRevealTime = new Date(session.nextRevealAt).getTime();
    const countdownSec = Math.max(0, Math.floor((nextRevealTime - Date.now()) / 1000));

    const publicPlayers = session.players.map((player) => {
      const isSelfOrSeeker = player.id === viewer.id || player.role === "Вода" || player.role === "seeker";
      return {
        id: player.id,
        nickname: player.nickname,
        role: player.role,
        color: player.color,
        lat: isSelfOrSeeker ? player.actualLat : player.revealedLat,
        lng: isSelfOrSeeker ? player.actualLng : player.revealedLng,
        delayed: isSelfOrSeeker ? false : (player.actualLat !== player.revealedLat || player.actualLng !== player.revealedLng),
        lastActualAt: player.lastActualAt,
        lastRevealedAt: player.lastRevealedAt,
      };
    });

    return {
      ok: true,
      data: {
        sessionCode: session.code,
        revealIntervalSeconds: session.revealIntervalSeconds,
        nextRevealAt: session.nextRevealAt,
        countdownSec,
        viewer: {
          id: viewer.id,
          nickname: viewer.nickname,
          role: viewer.role,
          isCreator: viewer.id === session.creatorId,
        },
        players: publicPlayers,
      },
    };
  } catch (err) {
    return { ok: false, reason: { status: 500, error: "Ошибка загрузки состояния" } };
  }
}
