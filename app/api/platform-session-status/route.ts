import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `
    select distinct on (platform) platform, session_valid, session_checked_at
    from platform_sessions
    where user_id = $1
    order by platform, created_at desc
    `,
    [user.id]
  );

  const items = result.rows.map((row) => ({
    platform: row.platform,
    sessionValid: row.session_valid,
    checkedAt: row.session_checked_at,
  }));

  return NextResponse.json({ items });
}
