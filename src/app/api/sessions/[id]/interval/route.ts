import { NextResponse } from "next/server";
import { sessions } from "@/lib/store";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionCode = id.toUpperCase();
    const body = await req.json();
    const { playerId, revealIntervalSeconds } = body as {
      playerId: string;
      revealIntervalSeconds: number;
    };

    const session = sessions.get(sessionCode);
    if (!session) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    if (session.creatorId !== playerId) {
      return NextResponse.json({ error: "Только создатель может менять интервал" }, { status: 403 });
    }

    const interval = Number(revealIntervalSeconds);
    if (interval > 0) {
      session.revealIntervalSeconds = interval;
      session.nextRevealAt = new Date(Date.now() + interval * 1000).toISOString();
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ошибка смены интервала" }, { status: 500 });
  }
}
