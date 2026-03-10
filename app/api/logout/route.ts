import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";

export async function POST() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");

  if (sessionCookie?.value) {
    await pool.query("delete from sessions where id = $1", [sessionCookie.value]);
  }

  const secureCookie = process.env.PUBLIC_BASE_URL?.startsWith("https://") ??
    process.env.NODE_ENV === "production";
  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    expires: new Date(0),
  });
  return response;
}
