import { NextResponse } from "next/server";
import { sessions } from "@/lib/store";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionCode = id.toUpperCase();
    const body = await req.json();
    const { playerId, lat, lng } = body as { playerId: string; lat: number; lng: number };

    const session = sessions.get(sessionCode);
    if (!session) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    const player = session.players.find((p) => p.id === playerId);
    if (!player) {
      return NextResponse.json({ error: "Игрок не найден" }, { status: 404 });
    }

    const now = new Date().toISOString();
    player.actualLat = lat;
    player.actualLng = lng;
    player.lastActualAt = now;

    if (player.role === "seeker" || player.revealedLat === null) {
      player.revealedLat = lat;
      player.revealedLng = lng;
      player.lastRevealedAt = now;
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ошибка обновления геолокации" }, { status: 500 });
  }
}
