import { NextResponse } from "next/server";
import { getRandomColor, sessions, Role } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, nickname, role } = body as { code: string; nickname: string; role: Role };

    const sessionCode = code?.trim().toUpperCase();
    const session = sessions.get(sessionCode);

    if (!session) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    const playerId = "p_" + Math.random().toString(36).substring(2, 9);
    const newPlayer = {
      id: playerId,
      nickname: nickname || "Игрок",
      role: role || "runner",
      color: getRandomColor(),
      actualLat: null,
      actualLng: null,
      revealedLat: null,
      revealedLng: null,
      lastActualAt: null,
      lastRevealedAt: null,
    };

    session.players.push(newPlayer);

    return NextResponse.json({
      sessionCode: session.code,
      playerId,
      nickname: newPlayer.nickname,
      role: newPlayer.role,
      isCreator: false,
      revealIntervalSeconds: session.revealIntervalSeconds,
    });
  } catch {
    return NextResponse.json({ error: "Ошибка подключения к комнате" }, { status: 500 });
  }
}
