import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json();
  const item = body?.item;

  if (!item || !item.title || !item.course || !item.due) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const due = Number(item.due);
  if (!Number.isFinite(due) || due <= 0) {
    return NextResponse.json({ error: "Invalid due" }, { status: 400 });
  }

  const result = await pool.query(
    `
    update deadlines
    set title = $1, course = $2, due_at = to_timestamp($3), status = $4, url = $5
    where id = $6 and user_id = $7 and platform = 'manual'
    returning id
    `,
    [item.title, item.course, due, item.status ?? null, item.url ?? null, id, user.id]
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const result = await pool.query(
    `
    delete from deadlines
    where id = $1 and user_id = $2 and platform = 'manual'
    `,
    [id, user.id]
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
