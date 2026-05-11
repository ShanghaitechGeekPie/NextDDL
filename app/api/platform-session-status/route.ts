import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { detectStoredAuthMode } from "@/lib/credential-vault";

type AuthMode = "session" | "credentials";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query(
    `
    select distinct on (platform) platform, encrypted_session, session_valid, session_checked_at
    from platform_sessions
    where user_id = $1
    order by platform, created_at desc
    `,
    [user.id]
  );

  const items = result.rows.map((row) => {
    let authMode: AuthMode = "session";
    let configured = false;
    try {
      configured = true;
      authMode = detectStoredAuthMode(row.encrypted_session);
    } catch {
      configured = false;
    }

    let accountStatus: "session_valid" | "session_expired" | "credentials_configured" | "not_configured" = "not_configured";
    if (configured && authMode === "credentials") {
      accountStatus = "credentials_configured";
    } else if (configured && row.session_valid === true) {
      accountStatus = "session_valid";
    } else if (configured && row.session_valid === false) {
      accountStatus = "session_expired";
    }

    return {
      platform: row.platform,
      configured,
      authMode,
      sessionValid: row.session_valid,
      accountStatus,
      checkedAt: row.session_checked_at,
    };
  });

  return NextResponse.json({ items });
}
