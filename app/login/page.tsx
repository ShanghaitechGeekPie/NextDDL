"use client";

const CODE_VERIFIER_KEY = "pkce_verifier";
const STATE_KEY = "pkce_state";

function base64UrlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(length = 43) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (x) => chars[x % chars.length]).join("");
}

async function sha256(input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  return crypto.subtle.digest("SHA-256", data);
}

export default function Login() {
  const handleLogin = async () => {
    const clientId = process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID;
    const serverUrl = process.env.NEXT_PUBLIC_CASDOOR_SERVER_URL;
    const redirectUri = process.env.NEXT_PUBLIC_CASDOOR_REDIRECT_URI ||
      `${window.location.origin}/auth/callback`;
    const signinUrl = process.env.NEXT_PUBLIC_CASDOOR_SIGNIN_URL ||
      (serverUrl ? `${serverUrl.replace(/\/+$/, "")}/login/oauth/authorize` : "");
    const scope = process.env.NEXT_PUBLIC_CASDOOR_SCOPE || "openid profile email";

    if (!clientId || !signinUrl) return;

    const state = randomString(32);
    const verifier = randomString(64);
    const challenge = base64UrlEncode(await sha256(verifier));

    sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    window.location.assign(`${signinUrl}?${params.toString()}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold">登录</h1>
      <button
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
        onClick={handleLogin}
      >
        通过GeekPie_Uni统一身份认证登录
      </button>
    </div>
  );
}
