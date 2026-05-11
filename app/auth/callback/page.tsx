"use client";

import { useEffect, useState } from "react";

type CasdoorTokenResponse = {
  access_token?: string;
  accessToken?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

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

const CODE_VERIFIER_KEY = "pkce_verifier";
const STATE_KEY = "pkce_state";

export default function CasdoorCallback() {
  const [message, setMessage] = useState("处理中...");

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const expectedState = sessionStorage.getItem(STATE_KEY);
      const verifier = sessionStorage.getItem(CODE_VERIFIER_KEY);

      if (!code || !state || !verifier || !expectedState) {
        setMessage("参数缺失，请重新登录");
        return;
      }

      if (state !== expectedState) {
        setMessage("状态校验失败，请重新登录");
        return;
      }

      const clientId = process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID;
      const serverUrl = process.env.NEXT_PUBLIC_CASDOOR_SERVER_URL;
      const redirectUri = process.env.NEXT_PUBLIC_CASDOOR_REDIRECT_URI ||
        `${window.location.origin}/auth/callback`;

      if (!clientId || !serverUrl) {
        setMessage("缺少 Casdoor 配置");
        return;
      }

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });

      const tokenRes = await fetch(`${serverUrl.replace(/\/+$/, "")}/api/login/oauth/access_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });

      const tokenJson = (await tokenRes.json()) as CasdoorTokenResponse;
      const accessToken = tokenJson.access_token ?? tokenJson.accessToken;

      if (!tokenRes.ok || !accessToken) {
        setMessage(tokenJson.error_description || tokenJson.error || "换取 token 失败");
        return;
      }

      const userInfoRes = await fetch(
        `${serverUrl.replace(/\/+$/, "")}/api/userinfo?accessToken=${encodeURIComponent(accessToken)}`
      );
      let userInfo: CasdoorUserInfo | null = null;
      if (userInfoRes.ok) {
        userInfo = (await userInfoRes.json()) as CasdoorUserInfo;
      }

      const hasName = (info: CasdoorUserInfo | null) => Boolean(
        info?.name || info?.displayName || info?.preferred_username || info?.nickname
      );

      if (!hasName(userInfo)) {
        const fallbackRes = await fetch(
          `${serverUrl.replace(/\/+$/, "")}/api/get-user?accessToken=${encodeURIComponent(accessToken)}`
        );
        if (fallbackRes.ok) {
          userInfo = (await fallbackRes.json()) as CasdoorUserInfo;
        }
      }

      if (!userInfo) {
        setMessage("获取用户信息失败");
        return;
      }

      const res = await fetch("/api/casdoor-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          expiresIn: tokenJson.expires_in,
          userInfo,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data?.error || "创建会话失败");
        return;
      }

      sessionStorage.removeItem(CODE_VERIFIER_KEY);
      sessionStorage.removeItem(STATE_KEY);
      window.location.assign("/");
    };

    run().catch(() => setMessage("登录失败，请重试"));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-slate-600">{message}</p>
    </div>
  );
}
