import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pool.query(
    `select ddl_retention_days from users where id = $1`,
    [user.id]
  );

  const retentionDays = result.rows[0]?.ddl_retention_days ?? 30;
  return NextResponse.json({ ddlRetentionDays: retentionDays });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const value = Number(body?.ddlRetentionDays);
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: "Invalid retention days" }, { status: 400 });
  }

  await pool.query(
    `update users set ddl_retention_days = $1 where id = $2`,
    [value, user.id]
  );

  return NextResponse.json({ ok: true });
}
