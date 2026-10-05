import { fail, ok } from "@/lib/api";
import { getSessionState } from "@/lib/tag-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const viewerId = searchParams.get("viewerId") || searchParams.get("nxtPid");

    if (!id || !viewerId) {
      return fail("Неверные параметры запроса", 400);
    }

    const result = await getSessionState(id, viewerId);

    if (!result.ok) {
      return fail(result.reason.error, result.reason.status);
    }

    return ok(result.data);
  } catch (err) {
    console.error("Error in session route:", err);
    return fail("Внутренняя ошибка сервера", 500);
  }
}
