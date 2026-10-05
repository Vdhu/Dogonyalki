import { fail, ok } from "@/lib/api";
import { joinSession } from "@/lib/tag-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { nickname, role } = body;

    if (!id) return fail("Код комнаты не указан", 400);

    const res = await joinSession(id, nickname || "Игрок", role || "runner");
    if (!res.ok) {
      return fail(res.error ?? "Не удалось войти", 400);
    }

    return ok(res);
  } catch (err) {
    console.error("Join room error:", err);
    return fail("Ошибка при входе в комнату", 500);
  }
}
