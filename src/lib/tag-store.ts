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

export interface ChatMessage {
  id: string;
  senderId: string;
  senderNickname: string;
  text: string;
  channel: "all" | "runners";
  createdAt: string;
}

export interface Session {
  code: string;
  creatorId: string;
  revealIntervalSeconds: number;
  nextRevealAt: string;
  players: Player[];
  messages?: ChatMessage[];
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

    const isSeeker = viewer.role === "seeker" || viewer.role === "Вода";

    // Фильтрация чата: если игрок Вода, отсекаем сообщения для убегающих
    const messages = (session.messages || []).filter((msg) => {
      if (msg.channel === "runners" && isSeeker) {
        return false;
      }
      return true;
    });

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
        messages,
      },
    };
  } catch (err) {
    return { ok: false, reason: { status: 500, error: "Ошибка загрузки состояния" } };
  }
}

export async function addChatMessage(
  code: string,
  senderId: string,
  text: string,
  channel: "all" | "runners"
) {
  const session = await getSession(code);
  if (!session) return { ok: false, error: "Комната не найдена" };

  const sender = session.players.find((p) => p.id === senderId);
  if (!sender) return { ok: false, error: "Игрок не найден" };

  const isSeeker = sender.role === "seeker" || sender.role === "Вода";
  if (channel === "runners" && isSeeker) {
    return { ok: false, error: "Вода не может писать в чат убегающих" };
  }

  const newMessage: ChatMessage = {
    id: "m_" + Math.random().toString(36).substring(2, 9),
    senderId: sender.id,
    senderNickname: sender.nickname,
    text: text.trim().substring(0, 300),
    channel,
    createdAt: new Date().toISOString(),
  };

  if (!session.messages) {
    session.messages = [];
  }

  session.messages.push(newMessage);
  // Храним последние 100 сообщений
  if (session.messages.length > 100) {
    session.messages = session.messages.slice(-100);
  }

  await saveSession(session);
  return { ok: true, message: newMessage };
}
