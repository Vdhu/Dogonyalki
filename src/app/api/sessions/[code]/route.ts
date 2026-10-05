import { NextRequest, NextResponse } from "next/server";
import { getSessionState, removePlayerFromSession } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const viewerId = request.nextUrl.searchParams.get("viewerId")?.trim();

    if (!viewerId) {
      return NextResponse.json({ error: "viewerId обязателен" }, { status: 400 });
    }

    const state = getSessionState(code, viewerId);
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка получения комнаты" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const viewerId = request.nextUrl.searchParams.get("viewerId")?.trim();

    if (!viewerId) {
      return NextResponse.json({ error: "viewerId обязателен" }, { status: 400 });
    }

    removePlayerFromSession(code, viewerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка выхода из комнаты" },
      { status: 400 },
    );
  }
}
