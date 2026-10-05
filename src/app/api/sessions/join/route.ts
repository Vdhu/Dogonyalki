import { NextResponse } from "next/server";
import { joinSession } from "@/lib/tag-store";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const roomCode = body.roomCode || body.code;
    const nickname = body.nickname || "Игрок";

    if (!roomCode) {
      return NextResponse.json({ error: "Missing room code" }, { status: 400 });
    }

    const result = await joinSession(roomCode, nickname);
    if (!result) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
