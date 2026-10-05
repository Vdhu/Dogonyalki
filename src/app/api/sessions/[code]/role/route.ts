import { NextRequest, NextResponse } from "next/server";
import { transferSeekerRole } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const body = (await request.json()) as {
      actorId?: unknown;
      targetPlayerId?: unknown;
    };

    const actorId = typeof body.actorId === "string" ? body.actorId.trim() : "";
    const targetPlayerId = typeof body.targetPlayerId === "string" ? body.targetPlayerId.trim() : "";

    if (!actorId || !targetPlayerId) {
      return NextResponse.json({ error: "actorId и targetPlayerId обязательны" }, { status: 400 });
    }

    transferSeekerRole(code, actorId, targetPlayerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка передачи роли" },
      { status: 400 },
    );
  }
}
