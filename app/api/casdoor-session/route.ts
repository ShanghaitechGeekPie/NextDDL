import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";

type CasdoorUserInfo = {
  id?: string;
  sub?: string;
  userId?: string;
  name?: string;
  displayName?: string;
  nickname?: string;
  preferred_username?: string;
  avatar?: string;
  avatarUrl?: string;
};

function normalizeCasdoorUser(info: CasdoorUserInfo) {
  const id = info.id || info.sub || info.userId;
  const name = info.name || info.displayName || info.preferred_username || info.nickname || "";
  const avatar = info.avatar || info.avatarUrl || "";

  if (!id) {
    throw new Error("Casdoor user id missing");
  }

  return { id, name, avatar };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const accessToken = String(body?.accessToken || "");
    const expiresIn = Number(body?.expiresIn);
    const userInfo = body?.userInfo as CasdoorUserInfo | undefined;

    if (!accessToken || !userInfo) {
      return NextResponse.json({ error: "Missing token or user info" }, { status: 400 });
    }

    const casdoorUser = normalizeCasdoorUser(userInfo);

    const user = await pool.query(
      `
      insert into users (geekpie_id, nickname, avatar_url)
      values ($1, $2, $3)
      on conflict (geekpie_id)
      do update set nickname = excluded.nickname, avatar_url = excluded.avatar_url
      returning *
      `,
      [casdoorUser.id, casdoorUser.name || null, casdoorUser.avatar || null]
    );

    const userId = user.rows[0].id;
    const sessionId = randomUUID();
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    const casdoorExpiresAt = Number.isFinite(expiresIn) ? new Date(Date.now() + expiresIn * 1000) : null;

    await pool.query(
      `
      insert into sessions (id, user_id, expires_at, casdoor_access_token, casdoor_expires_at)
      values ($1,$2,$3,$4,$5)
      `,
      [sessionId, userId, expires, accessToken, casdoorExpiresAt]
    );

    const response = NextResponse.json({ ok: true });
    const secureCookie = process.env.PUBLIC_BASE_URL?.startsWith("https://") ??
      process.env.NODE_ENV === "production";

    response.cookies.set("session", sessionId, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      expires,
    });

    return response;
  } catch (error) {
    console.error("Casdoor session create failed:", error);
    return NextResponse.json(
      {
        error: "Failed to create session",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
