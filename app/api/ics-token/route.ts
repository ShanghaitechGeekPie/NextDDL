import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getPublicOrigin } from "@/lib/public-origin";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await pool.query(
    "select token from ics_tokens where user_id = $1 limit 1",
    [user.id]
  );

  let token: string;

  if (existing.rows.length > 0) {
    token = existing.rows[0].token;
  } else {
    token = randomUUID();
    await pool.query(
      "insert into ics_tokens (user_id, token) values ($1, $2)",
      [user.id, token]
    );
  }

  const origin = getPublicOrigin(request);
  const url = `${origin}/api/ics/${token}`;

  return NextResponse.json({ token, url });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await pool.query("delete from ics_tokens where user_id = $1", [user.id]);
  const token = randomUUID();
  await pool.query(
    "insert into ics_tokens (user_id, token) values ($1, $2)",
    [user.id, token]
  );

  const origin = getPublicOrigin(request);
  const url = `${origin}/api/ics/${token}`;

  return NextResponse.json({ token, url });
}