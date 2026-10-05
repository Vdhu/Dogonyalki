import { NextResponse } from "next/server";
import { getRandomColor, sessions, Role } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nickname, role, revealIntervalSeconds } = body as {
      nickname: string;
      role: Role;
      revealIntervalSeconds: number;
    };

    if (!nickname?.trim()) {
      return NextResponse.json({ error: "Укажите никнейм" }, { status: 400 });
    }

    const sessionCode = "TAG-" + Math.floor(1000 + Math.random() * 9000);
    const playerId = "p_" + Math.random().toString(36).substring(2, 9);
    const interval = Number(revealIntervalSeconds) || 120;

    const newSession = {
      code: sessionCode,
      creatorId: playerId,
      revealIntervalSeconds: interval,
      nextRevealAt: new Date(Date.now() + interval * 1000).toISOString(),
      players: [
        {
          id: playerId,
          nickname,
          role: role || "runner",
          color: getRandomColor(),
          actualLat: null,
          actualLng: null,
          revealedLat: null,
          revealedLng: null,
          lastActualAt: null,
          lastRevealedAt: null,
        },
      ],
    };

    sessions.set(sessionCode, newSession);

    return NextResponse.json({
      sessionCode,
      playerId,
      nickname,
      role: role || "runner",
      isCreator: true,
      revealIntervalSeconds: interval,
    });
  } catch {
    return NextResponse.json({ error: "Ошибка создания комнаты" }, { status: 500 });
  }
}
