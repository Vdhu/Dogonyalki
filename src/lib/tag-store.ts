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
  messages: ChatMessage[];
  createdAt: string;
}

function getRoomKey(code: string): string {
  return `room:${code.trim().toUpperCase()}`;
}

export async function getSession(code: string): Promise<Session | null> {
  const normalizedCode = code.trim().toUpperCase();
  try {
    const raw = await redis.get(getRoomKey(normalizedCode));
    if (!raw) return null;
    if (typeof raw === "string") {
      return JSON.parse(raw) as Session;
    }
    return raw as Session;
  } catch (e) {
    console.error("Error fetching session from Redis:", e);
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  const normalizedCode = session.code.trim().toUpperCase();
  try {
    await redis.set(getRoomKey(normalizedCode), JSON.stringify(session), { ex: 86400 });
  } catch (e) {
    console.error("Error saving session to Redis:", e);
  }
}

export async function createSession(revealIntervalSeconds: number): Promise<Session> {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
  const code = `TAG-${randomSuffix}`;
  const creatorId = `p_${Math.random().toString(36).substring(2, 9)}`;

  const now = new Date();
  const nextReveal = new Date(now.getTime() + revealIntervalSeconds * 1000);

  const session: Session = {
    code,
    creatorId,
    revealIntervalSeconds,
    nextRevealAt: nextReveal.toISOString(),
    players: [],
    messages: [],
    createdAt: now.toISOString(),
  };

  await saveSession(session);
  return session;
}

export async function joinSession(code: string, nickname: string): Promise<{ session: Session; playerId: string } | null> {
  const session = await getSession(code);
  if (!session) return null;

  const playerId = `p_${Math.random().toString(36).substring(2, 9)}`;
  const colors = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];
  const assignedColor = colors[session.players.length % colors.length];

  const newPlayer: Player = {
    id: playerId,
    nickname,
    role: "runner",
    color: assignedColor,
    actualLat: 0,
    actualLng: 0,
    revealedLat: 0,
    revealedLng: 0,
    lastActualAt: new Date().toISOString(),
    lastRevealedAt: new Date().toISOString(),
  };

  session.players.push(newPlayer);
  await saveSession(session);

  return { session, playerId };
}

export async function updatePlayerRole(code: string, playerId: string, role: string): Promise<Session | null> {
  const session = await getSession(code);
  if (!session) return null;

  const player = session.players.find((p) => p.id === playerId);
  if (!player) return null;

  player.role = role;
  await saveSession(session);
  return session;
}

export async function updatePlayerLocation(code: string, playerId: string, lat: number, lng: number): Promise<Session | null> {
  const session = await getSession(code);
  if (!session) return null;

  const player = session.players.find((p) => p.id === playerId);
  if (!player) return null;

  const now = new Date();
  player.actualLat = lat;
  player.actualLng = lng;
  player.lastActualAt = now.toISOString();

  const isTimeForReveal = new Date(session.nextRevealAt).getTime() <= now.getTime();

  if (isTimeForReveal) {
    session.players.forEach((p) => {
      p.revealedLat = p.actualLat;
      p.revealedLng = p.actualLng;
      p.lastRevealedAt = now.toISOString();
    });
    session.nextRevealAt = new Date(now.getTime() + session.revealIntervalSeconds * 1000).toISOString();
  } else if (player.revealedLat === 0 && player.revealedLng === 0) {
    player.revealedLat = lat;
    player.revealedLng = lng;
    player.lastRevealedAt = now.toISOString();
  }

  await saveSession(session);
  return session;
}

export async function addChatMessage(code: string, senderId: string, text: string, channel: "all" | "runners"): Promise<Session | null> {
  const session = await getSession(code);
  if (!session) return null;

  const sender = session.players.find((p) => p.id === senderId);
  if (!sender) return null;

  const msg: ChatMessage = {
    id: `msg_${Math.random().toString(36).substring(2, 9)}`,
    senderId,
    senderNickname: sender.nickname,
    text,
    channel,
    createdAt: new Date().toISOString(),
  };

  session.messages.push(msg);
  await saveSession(session);
  return session;
}
