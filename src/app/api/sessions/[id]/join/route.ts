import { fail, ok, safeJson } from "@/lib/api";
import { joinSession, validateRole } from "@/lib/tag-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const parsed = await safeJson(req);
  if (!parsed.ok) {
    return fail("Некорректное тело запроса", 400);
  }

  const body = parsed.data as {
    nickname?: unknown;
    role?: unknown;
  };

  const result = await joinSession({
    sessionCode: id,
    nickname: typeof body.nickname === "string" ? body.nickname : "",
    role: validateRole(body.role),
  });

  if (!result.ok) {
    return fail(result.reason.error, result.reason.status);
  }

  return ok(result);
}
