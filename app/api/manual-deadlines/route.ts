import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const item = body?.item;

  if (!item || !item.title || !item.course || !item.due) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const due = Number(item.due);
  if (!Number.isFinite(due) || due <= 0) {
    return NextResponse.json({ error: "Invalid due" }, { status: 400 });
  }

  try {
    await pool.query(
      `
      insert into deadlines (user_id, platform, title, course, due_at, status, url)
      values ($1, 'manual', $2, $3, to_timestamp($4), $5, $6)
      `,
      [user.id, item.title, item.course, due, item.status ?? null, item.url ?? null]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
