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
    const { actorId, targetPlayerId } = body as { actorId: string; targetPlayerId: string };

    const session = sessions.get(sessionCode);
    if (!session) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    const actor = session.players.find((p) => p.id === actorId);
    if (!actor || actor.role !== "seeker") {
      return NextResponse.json({ error: "Передавать роль может только текущая Вода" }, { status: 403 });
    }

    const target = session.players.find((p) => p.id === targetPlayerId);
    if (!target) {
      return NextResponse.json({ error: "Целевой игрок не найден" }, { status: 404 });
    }

    actor.role = "runner";
    target.role = "seeker";

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ошибка передачи роли" }, { status: 500 });
  }
}
