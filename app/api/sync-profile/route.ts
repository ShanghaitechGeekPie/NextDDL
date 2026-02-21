import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

function getCasdoorConfig() {
  const serverUrl = process.env.NEXT_PUBLIC_CASDOOR_SERVER_URL;
  if (!serverUrl) {
    throw new Error("Missing Casdoor environment variables");
  }
  return { serverUrl };
}

async function fetchCasdoorUser(accessToken: string) {
  const { serverUrl } = getCasdoorConfig();

  const userInfoRes = await fetch(
    `${serverUrl}/api/userinfo?accessToken=${encodeURIComponent(accessToken)}`
  );

  if (userInfoRes.ok) {
    return (await userInfoRes.json()) as CasdoorUserInfo;
  }

  const fallbackRes = await fetch(
    `${serverUrl}/api/get-user?accessToken=${encodeURIComponent(accessToken)}`
  );

  if (!fallbackRes.ok) {
    throw new Error("Failed to fetch Casdoor user info");
  }

  return (await fallbackRes.json()) as CasdoorUserInfo;
}

function normalizeCasdoorUser(info: CasdoorUserInfo) {
  const id = info.id || info.sub || info.userId;
  const name = info.name || info.displayName || info.preferred_username || info.nickname || "";
  const avatar = info.avatar || info.avatarUrl || "";

  if (!id) {
    throw new Error("Casdoor user id missing");
  }

  return { id, name, avatar };
}

export async function POST() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");
  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionResult = await pool.query(
    `
    select user_id, casdoor_access_token, casdoor_expires_at
    from sessions
    where id = $1 and expires_at > now()
    `,
    [sessionCookie.value]
  );

  if (sessionResult.rows.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user_id: userId, casdoor_access_token: accessToken, casdoor_expires_at: expiresAt } =
    sessionResult.rows[0];

  if (!accessToken) {
    return NextResponse.json({ error: "Missing Casdoor token" }, { status: 409 });
  }

  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Casdoor token expired" }, { status: 409 });
  }

  try {
    const casdoorUserInfo = await fetchCasdoorUser(accessToken);
    const casdoorUser = normalizeCasdoorUser(casdoorUserInfo);

    await pool.query(
      `
      update users
      set nickname = $1, avatar_url = $2
      where id = $3 and geekpie_id = $4
      `,
      [casdoorUser.name || null, casdoorUser.avatar || null, userId, casdoorUser.id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
