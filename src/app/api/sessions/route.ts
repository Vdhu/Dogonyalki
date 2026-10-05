import { fail, ok } from "@/lib/api";
import { createSession } from "@/lib/tag-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nickname, role, revealIntervalSeconds } = body;

    const res = await createSession(nickname || "Игрок", role || "runner", Number(revealIntervalSeconds) || 120);
    return ok(res);
  } catch (err) {
    console.error("Create session error:", err);
    return fail("Внутренняя ошибка сервера", 500);
  }
}
