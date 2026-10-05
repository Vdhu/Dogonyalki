import { NextResponse } from "next/server";

export type ApiErrorStatus = 400 | 403 | 404 | 409 | 500;

export function ok<T>(payload: T, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function fail(error: string, status: ApiErrorStatus): NextResponse {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function safeJson(req: Request): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    const data = await req.json();
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}
