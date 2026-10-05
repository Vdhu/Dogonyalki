import { fail, ok } from "@/lib/api";
import { updatePlayerLocation } from "@/lib/tag-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { playerId, lat, lng } = body;

    if (!id || !playerId || typeof lat !== "number" || typeof lng !== "number") {
      return fail("Неверные параметры", 400);
    }

    const result = await updatePlayerLocation(id, playerId, lat, lng);
    if (!result.ok) {
      return fail(result.error ?? "Ошибка обновления локации", 400);
    }

    return ok({ success: true });
  } catch (err) {
    return fail("Внутренняя ошибка сервера", 500);
  }
}
