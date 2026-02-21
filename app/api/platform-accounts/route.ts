import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";

type Fields = Record<string, string>;
type SaveItem ={
    platform: string;
    identifierField?: string;
    fields: Fields;
}

const PLATFORM_API: Record<string, string> = {
  Hydro: "/api/hydro",
  Gradescope: "/api/gradescope",
  Blackboard: "/api/blackboard",
};

function getPythonBaseUrl() {
  const base = process.env.PYTHON_API_BASE_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:5000" : "");
  if (!base) {
    throw new Error("Missing PYTHON_API_BASE_URL");
  }
  return base;
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
          decryptJson<Record<string, unknown>>(row.encrypted_session)
          return { platform: row.platform, configured: true }
        } catch (error) {
          return { platform: row.platform, configured: false }
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
      const identifier = item.identifierField ? fields[item.identifierField] : undefined
      const api = PLATFORM_API[item.platform]
      if (!api) {
        throw new Error(`Unsupported platform: ${item.platform}`)
      }
      const baseUrl = getPythonBaseUrl()
      const response = await fetch(`${baseUrl}${api}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, include_session: true }),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch session for ${item.platform}`)
      }
      const result = await response.json()
      if (result?.status !== "success" || !result?.session) {
        throw new Error(`Failed to fetch session for ${item.platform}`)
      }
      const sessionData = item.platform === "Hydro"
        ? { cookies: result.session, url: fields.url }
        : { cookies: result.session }

      await client.query(
        `delete from platform_sessions where user_id = $1 and platform = $2`,
        [user.id, item.platform]
      )

      if (Object.keys(sessionData).length > 0) {
        const encrypted = encryptJson(sessionData)
        await client.query(
          `
          insert into platform_sessions (user_id, platform, encrypted_session, expires_at, session_valid, session_checked_at)
          values ($1, $2, $3, null, true, now())
          `,
          [user.id, item.platform, encrypted]
        )
      }

      void identifier
    }

    await client.query('commit')
    return NextResponse.json({ ok: true })
  } catch (error) {
    await client.query('rollback')
    console.error(error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  } finally {
    client.release()
  }
}