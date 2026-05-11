import { NextRequest } from "next/server";
import fetchPlatform, { DeadlineItem } from "@/lib/fetch-ddls";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/fetch-ddls
 * Body: { platforms: [{ platform: string, account?: string, password?: string, url?: string, session?: object }] }
 * or: { platform: string, fields: {...} }
 * Returns: { success: true, data: DeadlineItem[] }
 *
 * Canonical inputs:
 * - Hydro: account + password + url
 * - Gradescope: account + password
 * - Blackboard: account + password
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let tasks: Array<{ platform: string; fields: Record<string, unknown> }> = [];
    if (Array.isArray(body?.platforms)) {
      tasks = body.platforms.map((item: Record<string, unknown>) => ({
        platform: item.platform,
        fields: item.fields ?? item,
      }));
    } else if (body?.platform) {
      const { platform, fields, ...rest } = body;
      tasks = [{ platform, fields: fields ?? rest }];
    } else {
      return Response.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    const results = await Promise.all(
      tasks.map(async (t) => {
        try {
          const items = await fetchPlatform(t.platform, t.fields);
          return { platform: t.platform, items, error: null };
        } catch (err) {
          return { platform: t.platform, items: [], error: err instanceof Error ? err.message : String(err) };
        }
      })
    );

    const combined: DeadlineItem[] = results.flatMap((r) => r.items.map((it) => ({ ...it })));

    return Response.json({ success: true, data: combined, details: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
