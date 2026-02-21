import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { randomUUID } from "crypto";

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

type CasdoorTokenResponse = {
  access_token?: string;
  accessToken?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function getCasdoorConfig() {
  const serverUrl = process.env.NEXT_PUBLIC_CASDOOR_SERVER_URL;
  const clientId = process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID;
  const clientSecret = process.env.NEXT_PUBLIC_CASDOOR_CLIENT_SECRET;
  const redirectPath = "/auth/callback";

  if (!serverUrl || !clientId || !clientSecret) {
    throw new Error("Missing Casdoor environment variables");
  }

  return { serverUrl, clientId, clientSecret, redirectPath };
}

async function exchangeCodeForToken(code: string, requestUrl: string) {
  const { serverUrl, clientId, clientSecret, redirectPath } = getCasdoorConfig();
  const redirectUri = new URL(redirectPath, requestUrl).toString();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(`${serverUrl}/api/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokenJson = (await tokenRes.json()) as CasdoorTokenResponse;
  const accessToken = tokenJson.access_token ?? tokenJson.accessToken;

  if (!tokenRes.ok || !accessToken) {
    throw new Error(tokenJson.error_description || tokenJson.error || "Failed to exchange token");
  }

  return accessToken;
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const accessToken = await exchangeCodeForToken(code, request.url);
  const casdoorUserInfo = await fetchCasdoorUser(accessToken);
  const casdoorUser = normalizeCasdoorUser(casdoorUserInfo);

  let user = await pool.query(
    "select * from users where geekpie_id = $1",
    [casdoorUser.id]
  );

  if (user.rows.length === 0) {
    user = await pool.query(
      `
      insert into users (geekpie_id, nickname, avatar_url)
      values ($1,$2,$3)
      returning *
      `,
      [casdoorUser.id, casdoorUser.name, casdoorUser.avatar]
    );
  }

  const userId = user.rows[0].id;

  const sessionId = randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  await pool.query(
    `
    insert into sessions (id, user_id, expires_at)
    values ($1,$2,$3)
    `,
    [sessionId, userId, expires]
  );

  const response = NextResponse.redirect(new URL("/", request.url));

  response.cookies.set("session", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires,
  });

  return response;
}
