import "server-only";
import { pool } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";

type Fields = Record<string, string>;
type SessionData = {
  cookies?: Record<string, string>;
  url?: string;
} & Record<string, unknown>;

type PlatformFetchResult = {
  platform: string;
  items: DeadlineItem[];
  expired: boolean;
};

export type DeadlineItem = {
  platform: string;
  title: string;
  course: string;
  due: number;
  status?: string;
  url: string;
  submitted?: boolean;
};

const PLATFORM_API: Record<string, string> = {
  Hydro: "/api/hydro",
  Gradescope: "/api/gradescope",
  Blackboard: "/api/blackboard",
};

const PLATFORM_REQUIRED_FIELDS: Record<string, string[]> = {
  Hydro: ["url", "username", "password"],
  Gradescope: ["email", "password"],
  Blackboard: ["studentid", "password"],
};

function getPythonBaseUrl() {
  const base = process.env.PYTHON_API_BASE_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:5000" : "");
  if (!base) {
    throw new Error("Missing PYTHON_API_BASE_URL");
  }
  return base;
}

function hasRequiredFields(fields: Fields, required: string[]) {
  return required.every((key) => Boolean(fields[key]));
}

async function fetchPlatformDeadlines(platform: string, fields: Fields | SessionData): Promise<PlatformFetchResult> {
  const api = PLATFORM_API[platform];
  const required = PLATFORM_REQUIRED_FIELDS[platform] || [];

  if (!api) {
    return { platform, items: [], expired: false };
  }

  let payload: Record<string, unknown> = {};
  if ((fields as SessionData).cookies) {
    payload = { session: (fields as SessionData).cookies };
    if (platform === "Hydro") {
      const url = (fields as SessionData).url;
      if (!url) {
        return { platform, items: [], expired: false };
      }
      payload.url = url;
    }
  } else {
    if (!hasRequiredFields(fields as Fields, required)) {
      return { platform, items: [], expired: false };
    }
    payload = fields as Fields;
  }

  const baseUrl = getPythonBaseUrl();
  const response = await fetch(`${baseUrl}${api}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { platform, items: [], expired: false };
  }

  const result = await response.json();
  if (result?.status === "session_expired") {
    return { platform, items: [], expired: true };
  }
  if (result?.status !== "success" || !Array.isArray(result.data)) {
    return { platform, items: [], expired: false };
  }

  const items = result.data.map((item: DeadlineItem) => ({
    ...item,
    platform,
  }));
  return { platform, items, expired: false };
}

export type RefreshResult = {
  items: DeadlineItem[];
  expiredPlatforms: string[];
};

export async function refreshUserDeadlinesDetailed(userId: string): Promise<RefreshResult> {
  const retentionResult = await pool.query(
    `select ddl_retention_days from users where id = $1`,
    [userId]
  );
  const retentionValue = retentionResult.rows[0]?.ddl_retention_days;
  const retentionDays = Number.isFinite(Number(retentionValue)) && Number(retentionValue) > 0
    ? Number(retentionValue)
    : 30;

  const sessions = await pool.query(
    `
    select distinct on (platform) platform, encrypted_session
    from platform_sessions
    where user_id = $1
    order by platform, created_at desc
    `,
    [userId]
  );

  if (sessions.rows.length === 0) {
    return { items: [], expiredPlatforms: [] };
  }

  const platformFields = sessions.rows.map((row) => {
    let fields: Fields | SessionData = {};
    try {
      fields = decryptJson<SessionData | Fields>(row.encrypted_session);
    } catch {
      fields = {};
    }
    return { platform: row.platform as string, fields };
  });

  const results = await Promise.all(
    platformFields.map(({ platform, fields }) => fetchPlatformDeadlines(platform, fields))
  );

  const expiredPlatforms = results
    .filter((result) => result.expired)
    .map((result) => result.platform);

  const items = results
    .flatMap((result) => result.items)
    .filter((item) => item && item.title && item.due)
    .filter((item) => {
      // keep items with due >= now - retentionDays
      const nowSec = Math.floor(Date.now() / 1000)
      const cutoff = nowSec - retentionDays * 24 * 60 * 60
      return Number(item.due) >= cutoff
    })

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const result of results) {
      await client.query(
        "update platform_sessions set session_valid = $1, session_checked_at = now() where user_id = $2 and platform = $3",
        [!result.expired, userId, result.platform]
      );
    }
    await client.query(
      "delete from deadlines where user_id = $1 and platform <> 'manual'",
      [userId]
    );

    for (const item of items) {
      await client.query(
        `
        insert into deadlines (user_id, platform, title, course, due_at, status, url)
        values ($1, $2, $3, $4, to_timestamp($5), $6, $7)
        `,
        [
          userId,
          item.platform,
          item.title,
          item.course,
          item.due,
          item.status ?? null,
          item.url,
        ]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return { items, expiredPlatforms };
}

export async function refreshUserDeadlines(userId: string): Promise<DeadlineItem[]> {
  const result = await refreshUserDeadlinesDetailed(userId);
  return result.items;
}