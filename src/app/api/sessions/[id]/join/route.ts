import { NextResponse } from "next/server";
import { joinSession } from "@/lib/tag-store";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const nickname = body.nickname || "Игрок";
    const result = await joinSession(params.id, nickname);

    if (!result) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
