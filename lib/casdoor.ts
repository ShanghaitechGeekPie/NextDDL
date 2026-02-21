import Sdk from "casdoor-js-sdk";

export const casdoorConfig = {
  serverUrl: process.env.NEXT_PUBLIC_CASDOOR_SERVER_URL!,
  clientId: process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID!,
  clientSecret: process.env.NEXT_PUBLIC_CASDOOR_CLIENT_SECRET!,
  organizationName: process.env.NEXT_PUBLIC_CASDOOR_ORG_NAME!,
  appName: process.env.NEXT_PUBLIC_CASDOOR_APP_NAME!,
  redirectPath: "/auth/callback",
};



export function getCasdoorSDK() {
  if (typeof window === "undefined") {
    return null; 
  }
  return new Sdk(casdoorConfig);
}
