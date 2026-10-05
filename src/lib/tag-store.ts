import { db } from "@/db";
import { Role, tagPlayers, tagSessions } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

const SESSION_PREFIX = "TAG-";
const SESSION_MIN = 1000;
const SESSION_MAX = 9999;
const SESSION_ATTEMPTS = 20;

const DEFAULT_REVEAL_SECONDS = 120;
const MIN_REVEAL_SECONDS = 10;
const MAX_REVEAL_SECONDS = 3600;

export type PublicPlayer = {
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

export type SessionView = {
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
  players: PublicPlayer[];
};

export type CreateSessionInput = {
  nickname: string;
  role: Role;
  revealIntervalSeconds: number;
};

export type JoinSessionInput = {
  sessionCode: string;
  nickname: string;
  role: Role;
};

export type LocationInput = {
  sessionCode: string;
  playerId: string;
  lat: number;
  lng: number;
};

export type ServiceError = {
  status: 400 | 403 | 404 | 409 | 500;
  error: string;
};

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function sanitizeRevealInterval(input: number): number {
  if (!Number.isFinite(input)) return DEFAULT_REVEAL_SECONDS;
  const rounded = Math.floor(input);
  if (rounded < MIN_REVEAL_SECONDS) return MIN_REVEAL_SECONDS;
  if (rounded > MAX_REVEAL_SECONDS) return MAX_REVEAL_SECONDS;
  return rounded;
}

function isLatLngValid(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

async function generateUniqueSessionCode(): Promise<string | null> {
  for (let i = 0; i < SESSION_ATTEMPTS; i += 1) {
    const next = SESSION_PREFIX + Math.floor(SESSION_MIN + Math.random() * (SESSION_MAX - SESSION_MIN + 1));
    const existing = await db.query.tagSessions.findFirst({
      where: eq(tagSessions.code, next),
      columns: { code: true },
    });
    if (!existing) return next;
  }
  return null;
}

export function validateRole(input: unknown): Role {
  if (input === "seeker") return "seeker";
  return "runner";
}

export function validateNickname(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 40);
}

export async function createSession(input: CreateSessionInput): Promise<
  | {
      ok: true;
      sessionCode: string;
      playerId: string;
      nickname: string;
      role: Role;
      isCreator: true;
      revealIntervalSeconds: number;
    }
  | { ok: false; reason: ServiceError }
> {
  const nickname = validateNickname(input.nickname);
  if (!nickname) {
    return { ok: false, reason: { status: 400, error: "Укажите корректный никнейм" } };
  }

  const interval = sanitizeRevealInterval(input.revealIntervalSeconds);
  const role = validateRole(input.role);
  const code = await generateUniqueSessionCode();

  if (!code) {
    return {
      ok: false,
      reason: { status: 500, error: "Не удалось создать уникальный код комнаты" },
    };
  }

  const playerId = randomId("p");
  const now = new Date();
  const nextRevealAt = new Date(now.getTime() + interval * 1000);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(tagSessions).values({
        code,
        creatorId: playerId,
        revealIntervalSeconds: interval,
        nextRevealAt,
        updatedAt: now,
      });

      await tx.insert(tagPlayers).values({
        id: playerId,
        sessionCode: code,
        nickname,
        role,
        color: randomColor(),
      });
    });

    return {
      ok: true,
      sessionCode: code,
      playerId,
      nickname,
      role,
      isCreator: true,
      revealIntervalSeconds: interval,
    };
  } catch {
    return { ok: false, reason: { status: 500, error: "Ошибка создания комнаты" } };
  }
}

export async function joinSession(input: JoinSessionInput): Promise<
  | {
      ok: true;
      sessionCode: string;
      playerId: string;
      nickname: string;
      role: Role;
      isCreator: boolean;
      revealIntervalSeconds: number;
    }
  | { ok: false; reason: ServiceError }
> {
  const nickname = validateNickname(input.nickname);
  if (!nickname) {
    return { ok: false, reason: { status: 400, error: "Укажите корректный никнейм" } };
  }

  const sessionCode = normalizeCode(input.sessionCode);
  if (!sessionCode) {
    return { ok: false, reason: { status: 400, error: "Некорректный код комнаты" } };
  }

  try {
    const session = await db.query.tagSessions.findFirst({
      where: eq(tagSessions.code, sessionCode),
    });

    if (!session) {
      return { ok: false, reason: { status: 404, error: "Комната не найдена" } };
    }

    const playerId = randomId("p");
    const role = validateRole(input.role);

    await db.insert(tagPlayers).values({
      id: playerId,
      sessionCode,
      nickname,
      role,
      color: randomColor(),
    });

    return {
      ok: true,
      sessionCode,
      playerId,
      nickname,
      role,
      isCreator: playerId === session.creatorId,
      revealIntervalSeconds: session.revealIntervalSeconds,
    };
  } catch {
    return { ok: false, reason: { status: 500, error: "Ошибка входа в комнату" } };
  }
}

export async function upsertLocation(input: LocationInput): Promise<{ ok: true } | { ok: false; reason: ServiceError }> {
  const sessionCode = normalizeCode(input.sessionCode);

  if (!sessionCode) {
    return { ok: false, reason: { status: 400, error: "Некорректный код комнаты" } };
  }

  if (!input.playerId) {
    return { ok: false, reason: { status: 400, error: "playerId обязателен" } };
  }

  if (!isLatLngValid(input.lat, input.lng)) {
    return { ok: false, reason: { status: 400, error: "Некорректные координаты" } };
  }

  try {
    const session = await db.query.tagSessions.findFirst({
      where: eq(tagSessions.code, sessionCode),
      columns: { code: true },
    });

    if (!session) {
      return { ok: false, reason: { status: 404, error: "Комната не найдена" } };
    }

    const player = await db.query.tagPlayers.findFirst({
      where: and(eq(tagPlayers.sessionCode, sessionCode), eq(tagPlayers.id, input.playerId)),
    });

    if (!player) {
      return { ok: false, reason: { status: 404, error: "Игрок не найден" } };
    }

    const now = new Date();

    const update: Partial<typeof tagPlayers.$inferInsert> = {
      actualLat: input.lat,
      actualLng: input.lng,
      lastActualAt: now,
    };

    if (player.role === "seeker" || player.revealedLat === null || player.revealedLng === null) {
      update.revealedLat = input.lat;
      update.revealedLng = input.lng;
      update.lastRevealedAt = now;
    }

    await db
      .update(tagPlayers)
      .set(update)
      .where(and(eq(tagPlayers.sessionCode, sessionCode), eq(tagPlayers.id, input.playerId)));

    return { ok: true };
  } catch {
    return { ok: false, reason: { status: 500, error: "Ошибка обновления геолокации" } };
  }
}

async function tickRevealIfNeeded(sessionCode: string): Promise<void> {
  const session = await db.query.tagSessions.findFirst({
    where: eq(tagSessions.code, sessionCode),
  });

  if (!session) return;

  const now = new Date();
  if (now.getTime() < session.nextRevealAt.getTime()) return;

  const players = await db.query.tagPlayers.findMany({
    where: eq(tagPlayers.sessionCode, sessionCode),
  });

  const runnerIdsToReveal = players
    .filter((player) => player.role === "runner" && player.actualLat !== null && player.actualLng !== null)
    .map((player) => player.id);

  if (runnerIdsToReveal.length > 0) {
    await db
      .update(tagPlayers)
      .set({
        revealedLat: tagPlayers.actualLat,
        revealedLng: tagPlayers.actualLng,
        lastRevealedAt: now,
      })
      .where(inArray(tagPlayers.id, runnerIdsToReveal));
  }

  await db
    .update(tagSessions)
    .set({
      nextRevealAt: new Date(now.getTime() + session.revealIntervalSeconds * 1000),
      updatedAt: now,
    })
    .where(eq(tagSessions.code, sessionCode));
}

export async function getSessionView(
  sessionCodeInput: string,
  viewerId: string | null
): Promise<{ ok: true; data: SessionView } | { ok: false; reason: ServiceError }> {
  const sessionCode = normalizeCode(sessionCodeInput);

  if (!viewerId) {
    return { ok: false, reason: { status: 400, error: "viewerId обязателен" } };
  }

  try {
    const sessionExists = await db.query.tagSessions.findFirst({
      where: eq(tagSessions.code, sessionCode),
      columns: { code: true },
    });

    if (!sessionExists) {
      return { ok: false, reason: { status: 404, error: "Комната не найдена" } };
    }

    await tickRevealIfNeeded(sessionCode);

    const session = await db.query.tagSessions.findFirst({
      where: eq(tagSessions.code, sessionCode),
    });

    if (!session) {
      return { ok: false, reason: { status: 404, error: "Комната не найдена" } };
    }

    const players = await db.query.tagPlayers.findMany({
      where: eq(tagPlayers.sessionCode, sessionCode),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    });

    const viewer = players.find((player) => player.id === viewerId);

    if (!viewer) {
      return { ok: false, reason: { status: 403, error: "Вы не участник этой комнаты" } };
    }

    const now = Date.now();
    const countdownSec = Math.max(0, Math.ceil((session.nextRevealAt.getTime() - now) / 1000));

    const publicPlayers: PublicPlayer[] = players.map((player) => {
      if (viewer.role === "seeker") {
        return {
          id: player.id,
          nickname: player.nickname,
          role: player.role,
          color: player.color,
          lat: player.actualLat,
          lng: player.actualLng,
          delayed: false,
          lastActualAt: toIso(player.lastActualAt),
          lastRevealedAt: toIso(player.lastRevealedAt),
        };
      }

      if (player.id === viewer.id || player.role === "seeker") {
        return {
          id: player.id,
          nickname: player.nickname,
          role: player.role,
          color: player.color,
          lat: player.actualLat,
          lng: player.actualLng,
          delayed: false,
          lastActualAt: toIso(player.lastActualAt),
          lastRevealedAt: toIso(player.lastRevealedAt),
        };
      }

      return {
        id: player.id,
        nickname: player.nickname,
        role: player.role,
        color: player.color,
        lat: player.revealedLat,
        lng: player.revealedLng,
        delayed: player.actualLat !== player.revealedLat || player.actualLng !== player.revealedLng,
        lastActualAt: toIso(player.lastActualAt),
        lastRevealedAt: toIso(player.lastRevealedAt),
      };
    });

    return {
      ok: true,
      data: {
        sessionCode: session.code,
        revealIntervalSeconds: session.revealIntervalSeconds,
        nextRevealAt: session.nextRevealAt.toISOString(),
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
  } catch {
    return { ok: false, reason: { status: 500, error: "Ошибка загрузки состояния" } };
  }
}
