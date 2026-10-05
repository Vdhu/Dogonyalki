import { NextRequest, NextResponse } from "next/server";
import { updatePlayerLocation } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const body = (await request.json()) as {
      playerId?: unknown;
      lat?: unknown;
      lng?: unknown;
    };

    const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
    const lat = typeof body.lat === "number" ? body.lat : NaN;
    const lng = typeof body.lng === "number" ? body.lng : NaN;

    if (!playerId) {
      return NextResponse.json({ error: "playerId обязателен" }, { status: 400 });
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Некорректные координаты" }, { status: 400 });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: "Координаты вне допустимого диапазона" }, { status: 400 });
    }

    updatePlayerLocation(code, playerId, lat, lng);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сохранения GPS" },
      { status: 400 },
    );
  }
}
