import { fail, ok, safeJson } from "@/lib/api";
import { upsertLocation } from "@/lib/tag-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const parsed = await safeJson(req);
  if (!parsed.ok) {
    return fail("Некорректное тело запроса", 400);
  }

  const body = parsed.data as {
    playerId?: unknown;
    lat?: unknown;
    lng?: unknown;
  };

  const playerId = typeof body.playerId === "string" ? body.playerId : "";
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat ?? Number.NaN);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng ?? Number.NaN);

  const result = await upsertLocation({
    sessionCode: id,
    playerId,
    lat,
    lng,
  });

  if (!result.ok) {
    return fail(result.reason.error, result.reason.status);
  }

  return ok({ ok: true });
}
