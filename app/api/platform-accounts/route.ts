import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  detectStoredAuthMode,
  encryptCredentialsPayloadForUser,
  encryptSessionPayload,
} from "@/lib/credential-vault";
import fetchPlatform, {
  loginBlackboardSession,
  loginGradescopeSession,
  loginHydroSession,
} from "@/lib/fetch-ddls";

type Fields = Record<string, string>;
type AuthMode = "session" | "credentials";
type SaveItem ={
    platform: string;
    identifierField?: string;
    fields: Fields;
  authMode?: AuthMode;
}

const PLATFORM_REQUIRED_FIELDS: Record<string, string[]> = {
  Hydro: ["url", "username", "password"],
  Gradescope: ["email", "password"],
  Blackboard: ["studentid", "password"],
};

async function resolveSessionCookies(platform: string, fields: Fields) {
  if (platform === "Hydro") {
    const url = fields.url;
    const username = fields.username;
    const password = fields.password;
    if (!url || !username || !password) {
      throw new Error("Missing required fields for Hydro");
    }
    return loginHydroSession(url, username, password);
  }

  if (platform === "Gradescope") {
    const email = fields.email;
    const password = fields.password;
    if (!email || !password) {
      throw new Error("Missing required fields for Gradescope");
    }
    return loginGradescopeSession(email, password);
  }

  if (platform === "Blackboard") {
    const studentId = fields.studentid;
    const password = fields.password;
    if (!studentId || !password) {
      throw new Error("Missing required fields for Blackboard");
    }
    return loginBlackboardSession(studentId, password);
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

export async function GET(){
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await pool.query(
        `
        select distinct on (platform) platform, encrypted_session
        from platform_sessions
        where user_id = $1
        order by platform, created_at desc
        `,
        [user.id]
    )
    const items = result.rows.map((row) => {
        try {
          const authMode = detectStoredAuthMode(row.encrypted_session)
          return { platform: row.platform, configured: true, authMode }
        } catch (error) {
          return { platform: row.platform, configured: false, authMode: "session" }
        }
    })
    return NextResponse.json({ items })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const items: SaveItem[] = body.items ?? []

  const client = await pool.connect()
  try {
    await client.query('begin')

    for (const item of items) {
      const fields = item.fields ?? {}
      const authMode: AuthMode = item.authMode === "credentials" ? "credentials" : "session"
      const requiredFields = PLATFORM_REQUIRED_FIELDS[item.platform] ?? []
      if (!requiredFields.every((key) => Boolean(fields[key]))) {
        throw new Error(`Missing required fields for ${item.platform}`)
      }

      let storedData: Record<string, unknown> = {}
      let sessionValid: boolean | null
      let sessionCheckedAtSql = "now()"

      if (authMode === "session") {
        const cookies = await resolveSessionCookies(item.platform, fields)
        storedData = item.platform === "Hydro"
          ? { authMode, cookies, url: fields.url }
          : { authMode, cookies }
        sessionValid = true
      } else {
        await fetchPlatform(item.platform, fields)
        sessionValid = null
        sessionCheckedAtSql = "null"
      }

      await client.query(
        `delete from platform_sessions where user_id = $1 and platform = $2`,
        [user.id, item.platform]
      )

      const encrypted = authMode === "credentials"
        ? encryptCredentialsPayloadForUser(user.id, fields)
        : encryptSessionPayload(storedData)
      await client.query(
        `
        insert into platform_sessions (user_id, platform, encrypted_session, expires_at, session_valid, session_checked_at)
        values ($1, $2, $3, null, $4, ${sessionCheckedAtSql})
        `,
        [user.id, item.platform, encrypted, sessionValid]
      )
    }

    await client.query('commit')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('rollback')
    console.error(err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  } finally {
    client.release()
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const platform = String(body?.platform || "").trim()
  if (!platform) {
    return NextResponse.json({ error: 'Missing platform' }, { status: 400 })
  }

  const result = await pool.query(
    `delete from platform_sessions where user_id = $1 and platform = $2`,
    [user.id, platform]
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}