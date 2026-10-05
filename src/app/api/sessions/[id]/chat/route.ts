import { fail, ok } from "@/lib/api";
import { addChatMessage } from "@/lib/tag-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { playerId, text, channel } = body;

    if (!id || !playerId || !text) {
      return fail("Неполные данные", 400);
    }

    const selectedChannel = channel === "runners" ? "runners" : "all";
    const result = await addChatMessage(id, playerId, text, selectedChannel);

    if (!result.ok) {
      return fail(result.error ?? "Ошибка отправки", 400);
    }

    return ok(result.message);
  } catch (err) {
    return fail("Ошибка отправки чата", 500);
  }
}
