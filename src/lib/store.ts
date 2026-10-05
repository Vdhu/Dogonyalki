export type Role = "seeker" | "runner";

export type PlayerInternal = {
  id: string;
  nickname: string;
  role: Role;
  color: string;
  actualLat: number | null;
  actualLng: number | null;
  revealedLat: number | null;
  revealedLng: number | null;
  lastActualAt: string | null;
  lastRevealedAt: string | null;
};

export type SessionInternal = {
  code: string;
  creatorId: string;
  revealIntervalSeconds: number;
  nextRevealAt: string;
  players: PlayerInternal[];
};

const globalForStore = globalThis as unknown as {
  sessionsStore: Map<string, SessionInternal>;
};

export const sessions = globalForStore.sessionsStore || new Map<string, SessionInternal>();
if (process.env.NODE_ENV !== "production") globalForStore.sessionsStore = sessions;

const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

export function getRandomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function updateSessionTimer(session: SessionInternal) {
  const now = Date.now();
  const nextRevealTime = new Date(session.nextRevealAt).getTime();

  if (now >= nextRevealTime) {
    session.players.forEach((p) => {
      if (p.actualLat !== null && p.actualLng !== null) {
        p.revealedLat = p.actualLat;
        p.revealedLng = p.actualLng;
        p.lastRevealedAt = new Date().toISOString();
      }
    });
    session.nextRevealAt = new Date(now + session.revealIntervalSeconds * 1000).toISOString();
  }
}
