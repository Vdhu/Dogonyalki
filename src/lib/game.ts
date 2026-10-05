export type Role = "seeker" | "runner";

export interface Player {
  id: string;
  nickname: string;
  role: Role;
  color: string;
  lat: number | null;
  lng: number | null;
  lastPingAt: string | null;
  lastActualAt: string | null;
  lastRevealedAt: string | null;
  revealedLat: number | null;
  revealedLng: number | null;
}

export interface Session {
  code: string;
  revealIntervalSeconds: number;
  nextRevealAt: string;
  creatorId: string;
  players: Map<string, Player>;
  lastActivityAt: string;
}

const sessions = new Map<string, Session>();

export function hasSession(code: string) {
  return sessions.has(code.trim().toUpperCase());
}

const COLORS = [
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

const EMPTY_SESSION_GRACE_MS = 0;
const STALE_SESSION_MAX_MS = 3 * 60 * 60 * 1000;
const DEFAULT_REVEAL_INTERVAL_SECONDS = 120;
const MIN_REVEAL_INTERVAL_SECONDS = 1;

function sanitizeIntervalSeconds(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_REVEAL_INTERVAL_SECONDS;
  }
  return Math.max(MIN_REVEAL_INTERVAL_SECONDS, value);
}

function nowIso() {
  return new Date().toISOString();
}

function createNextRevealAt(intervalSeconds: number) {
  return new Date(Date.now() + intervalSeconds * 1000).toISOString();
}

function cleanupOldSessions() {
  const now = Date.now();
  for (const [code, session] of sessions.entries()) {
    const lastActiveMs = new Date(session.lastActivityAt).getTime();
    const isEmpty = session.players.size === 0;

    if (isEmpty && now - lastActiveMs >= EMPTY_SESSION_GRACE_MS) {
      sessions.delete(code);
      continue;
    }

    if (now - lastActiveMs > STALE_SESSION_MAX_MS) {
      sessions.delete(code);
    }
  }
}

function ensureSingleSeeker(session: Session, preferredSeekerId?: string) {
  if (session.players.size === 0) {
    return;
  }

  const candidates = Array.from(session.players.values());
  const preferred = preferredSeekerId
    ? session.players.get(preferredSeekerId)
    : candidates.find((p) => p.role === "seeker");

  const chosen = preferred ?? candidates[0];

  for (const player of candidates) {
    player.role = player.id === chosen.id ? "seeker" : "runner";
  }
}

export function getOrCreateSession(code: string, revealIntervalSeconds = DEFAULT_REVEAL_INTERVAL_SECONDS): Session {
  cleanupOldSessions();

  const normalizedCode = code.trim().toUpperCase();
  let session = sessions.get(normalizedCode);

  if (!session) {
    const interval = sanitizeIntervalSeconds(revealIntervalSeconds);
    session = {
      code: normalizedCode,
      revealIntervalSeconds: interval,
      nextRevealAt: createNextRevealAt(interval),
      creatorId: "",
      players: new Map(),
      lastActivityAt: nowIso(),
    };
    sessions.set(normalizedCode, session);
  }

  return session;
}

export function addPlayerToSession(
  code: string,
  nickname: string,
  role: Role,
  customIntervalSeconds?: number,
): { session: Session; player: Player; isCreator: boolean } {
  const interval = sanitizeIntervalSeconds(customIntervalSeconds);
  const session = getOrCreateSession(code, interval);
  session.lastActivityAt = nowIso();

  const playerId = Math.random().toString(36).slice(2, 10);
  const assignedColor = COLORS[session.players.size % COLORS.length];

  let nextRole: Role = role;
  if (role === "seeker") {
    const existingSeeker = Array.from(session.players.values()).find((p) => p.role === "seeker");
    if (existingSeeker) {
      nextRole = "runner";
    }
  }

  const player: Player = {
    id: playerId,
    nickname: nickname.trim() || "Игрок",
    role: nextRole,
    color: assignedColor,
    lat: null,
    lng: null,
    lastPingAt: null,
    lastActualAt: null,
    lastRevealedAt: null,
    revealedLat: null,
    revealedLng: null,
  };

  let isCreator = false;
  if (session.players.size === 0 || !session.creatorId) {
    session.creatorId = playerId;
    isCreator = true;
  }

  session.players.set(playerId, player);

  ensureSingleSeeker(session, session.players.size === 1 ? playerId : undefined);

  return { session, player, isCreator };
}

export function removePlayerFromSession(code: string, playerId: string) {
  const session = sessions.get(code.trim().toUpperCase());
  if (!session) return;

  const removed = session.players.delete(playerId);
  if (!removed) return;

  session.lastActivityAt = nowIso();

  if (session.players.size === 0) {
    sessions.delete(session.code);
    return;
  }

  if (session.creatorId === playerId) {
    const firstRemaining = session.players.keys().next().value;
    if (firstRemaining) {
      session.creatorId = firstRemaining;
    }
  }

  const currentSeeker = Array.from(session.players.values()).find((p) => p.role === "seeker");
  if (!currentSeeker) {
    ensureSingleSeeker(session);
  }
}

export function updatePlayerLocation(code: string, playerId: string, lat: number, lng: number) {
  const session = sessions.get(code.trim().toUpperCase());
  if (!session) throw new Error("Комната не найдена");

  const player = session.players.get(playerId);
  if (!player) throw new Error("Игрок не найден в комнате");

  const now = nowIso();
  player.lat = lat;
  player.lng = lng;
  player.lastPingAt = now;
  player.lastActualAt = now;
  session.lastActivityAt = now;
}

export function transferSeekerRole(code: string, actorId: string, targetPlayerId: string) {
  const session = sessions.get(code.trim().toUpperCase());
  if (!session) throw new Error("Комната не найдена");

  const actor = session.players.get(actorId);
  const target = session.players.get(targetPlayerId);

  if (!actor || !target) throw new Error("Игроки не найдены");
  if (actor.id === target.id) throw new Error("Нельзя передать роль самому себе");
  if (actor.role !== "seeker") throw new Error("Передавать роль может только текущая Вода");

  for (const p of session.players.values()) {
    p.role = "runner";
  }
  target.role = "seeker";

  session.lastActivityAt = nowIso();
}

export function updateSessionInterval(code: string, playerId: string, newIntervalSeconds: number) {
  const session = sessions.get(code.trim().toUpperCase());
  if (!session) throw new Error("Комната не найдена");
  if (session.creatorId !== playerId) throw new Error("Только создатель может менять интервал");

  const normalized = sanitizeIntervalSeconds(newIntervalSeconds);
  session.revealIntervalSeconds = normalized;
  session.nextRevealAt = createNextRevealAt(normalized);
  session.lastActivityAt = nowIso();
}

export function getSessionState(code: string, viewerId: string) {
  cleanupOldSessions();

  const session = sessions.get(code.trim().toUpperCase());
  if (!session) throw new Error("Комната не найдена");

  const viewer = session.players.get(viewerId);
  if (!viewer) throw new Error("Вы не участник этой комнаты");

  const now = Date.now();
  const nextRevealMs = new Date(session.nextRevealAt).getTime();

  if (now >= nextRevealMs) {
    const nowTimestamp = nowIso();
    session.nextRevealAt = createNextRevealAt(session.revealIntervalSeconds);

    for (const p of session.players.values()) {
      if (p.lat !== null && p.lng !== null) {
        p.revealedLat = p.lat;
        p.revealedLng = p.lng;
        p.lastRevealedAt = nowTimestamp;
      }
    }
  }

  const countdownSec = Math.max(0, Math.ceil((new Date(session.nextRevealAt).getTime() - Date.now()) / 1000));

  const playersPayload = Array.from(session.players.values()).map((p) => {
    return {
      id: p.id,
      nickname: p.nickname,
      role: p.role,
      color: p.color,
      lat: p.lat,
      lng: p.lng,
      delayed: false,
      lastActualAt: p.lastActualAt,
      lastRevealedAt: p.lastRevealedAt,
    };
  });

  return {
    sessionCode: session.code,
    revealIntervalSeconds: session.revealIntervalSeconds,
    nextRevealAt: session.nextRevealAt,
    countdownSec,
    viewer: {
      id: viewer.id,
      nickname: viewer.nickname,
      role: viewer.role,
      isCreator: session.creatorId === viewer.id,
    },
    players: playersPayload,
  };
}
