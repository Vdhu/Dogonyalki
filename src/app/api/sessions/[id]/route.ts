import { NextResponse } from "next/server";
import { sessions, updateSessionTimer } from "@/lib/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionCode = id.toUpperCase();
    const { searchParams } = new URL(req.url);
    const viewerId = searchParams.get("viewerId");

    const session = sessions.get(sessionCode);
    if (!session) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    const viewer = session.players.find((p) => p.id === viewerId);
    if (!viewer) {
      return NextResponse.json({ error: "Вы не участник этой комнаты" }, { status: 403 });
    }

    updateSessionTimer(session);

    const now = Date.now();
    const countdownSec = Math.max(
      0,
      Math.ceil((new Date(session.nextRevealAt).getTime() - now) / 1000)
    );

    const players = session.players.map((p) => {
      const isRunner = p.role === "runner";
      const showRevealed = viewer.role === "seeker" && isRunner;

      return {
        id: p.id,
        nickname: p.nickname,
        role: p.role,
        color: p.color,
        lat: showRevealed ? p.revealedLat : p.actualLat,
        lng: showRevealed ? p.revealedLng : p.actualLng,
        delayed: showRevealed && p.actualLat !== p.revealedLat,
        lastActualAt: p.lastActualAt,
        lastRevealedAt: p.lastRevealedAt,
      };
    });

    return NextResponse.json({
      sessionCode: session.code,
      revealIntervalSeconds: session.revealIntervalSeconds,
      nextRevealAt: session.nextRevealAt,
      countdownSec,
      viewer: {
        id: viewer.id,
        nickname: viewer.nickname,
        role: viewer.role,
        isCreator: viewer.id === session.creatorId,
      },
      players,
    });
  } catch {
    return NextResponse.json({ error: "Ошибка загрузки состояния" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionCode = id.toUpperCase();
    const { searchParams } = new URL(req.url);
    const viewerId = searchParams.get("viewerId");

    const session = sessions.get(sessionCode);
    if (session && viewerId) {
      session.players = session.players.filter((p) => p.id !== viewerId);
      if (session.players.length === 0) {
        sessions.delete(sessionCode);
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
