import { NextRequest, NextResponse } from "next/server";
import { updateSessionInterval } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const body = (await request.json()) as {
      playerId?: unknown;
      revealIntervalSeconds?: unknown;
    };

    const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
    const revealIntervalSeconds =
      typeof body.revealIntervalSeconds === "number" && Number.isFinite(body.revealIntervalSeconds)
        ? body.revealIntervalSeconds
        : NaN;

    if (!playerId) {
      return NextResponse.json({ error: "playerId обязателен" }, { status: 400 });
    }

    if (!Number.isFinite(revealIntervalSeconds) || revealIntervalSeconds <= 0) {
      return NextResponse.json({ error: "Интервал должен быть положительным числом" }, { status: 400 });
    }

    updateSessionInterval(code, playerId, revealIntervalSeconds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка смены интервала" },
      { status: 400 },
    );
  }
}
