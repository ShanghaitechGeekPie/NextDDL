"use client";

import { useEffect, useState } from "react";
import { getCasdoorSDK } from "@/lib/casdoor";

export default function Login() {
  const [casdoorSDK, setCasdoorSDK] = useState<any>(null);

  useEffect(() => {
    const sdk = getCasdoorSDK();
    setCasdoorSDK(sdk);
  }, []);

  const handleLogin = () => {
    if (!casdoorSDK) return;
    const url = casdoorSDK.getSigninUrl();
    window.location.assign(url);
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
