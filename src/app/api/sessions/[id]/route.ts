import { fail, ok } from "@/lib/api";
import { getSessionView } from "@/lib/tag-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const viewerId = searchParams.get("viewerId");

  const result = await getSessionView(id, viewerId);

  if (!result.ok) {
    return fail(result.reason.error, result.reason.status);
  }

  return ok(result.data);
}
