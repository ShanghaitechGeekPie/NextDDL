import "server-only";
import { pool } from "@/lib/db";
import { decryptStoredPlatformDataForUser } from "@/lib/credential-vault";
import { isSubmittedStatus } from "@/lib/deadline-status";
import fetchPlatform from "@/lib/fetch-ddls";

type Fields = Record<string, string>;
type AuthMode = "session" | "credentials";
type SessionData = {
  authMode?: AuthMode;
  cookies?: Record<string, string>;
  url?: string;
} & Record<string, unknown>;

type PlatformFetchResult = {
  platform: string;
  authMode: AuthMode;
  items: DeadlineItem[];
  expired: boolean;
  fetched: boolean;
};

export type DeadlineItem = {
  platform: string;
  title: string;
  course: string;
  due: number;
  status?: string;
  url: string;
  completed?: boolean;
};

const PLATFORM_REQUIRED_FIELDS: Record<string, string[]> = {
  Hydro: ["url", "username", "password"],
  Gradescope: ["email", "password"],
  Blackboard: ["studentid", "password"],
};

function hasRequiredFields(fields: Fields, required: string[]) {
  return required.every((key) => Boolean(fields[key]));
}

async function fetchPlatformDeadlines(platform: string, fields: Fields | SessionData): Promise<PlatformFetchResult> {
  const required = PLATFORM_REQUIRED_FIELDS[platform] || [];
  const authMode: AuthMode = (fields as SessionData).authMode === "credentials" ? "credentials" : "session";

  let payload: Record<string, unknown> = {};
  if ((fields as SessionData).cookies) {
    payload = { session: (fields as SessionData).cookies };
    if (platform === "Hydro") {
      const url = (fields as SessionData).url;
      if (!url) {
        return { platform, authMode, items: [], expired: false, fetched: false };
      }
      payload.url = url;
    }
  } else {
    if (!hasRequiredFields(fields as Fields, required)) {
      return { platform, authMode, items: [], expired: false, fetched: false };
    }
    payload = fields as Fields;
  }

  try {
    const items = await fetchPlatform(platform, payload);
    return { platform, authMode, items, expired: false, fetched: true };
  } catch {
    const expired = authMode === "session";
    return { platform, authMode, items: [], expired, fetched: false };
  }
}

export type RefreshResult = {
  items: DeadlineItem[];
  expiredPlatforms: string[];
};

function getDeadlineKey(item: {
  platform?: string;
  title?: string;
  course?: string;
  due?: number;
  url?: string;
}) {
  return [
    item.platform ?? "",
    item.title ?? "",
    item.course ?? "",
    String(item.due ?? ""),
    item.url ?? "",
  ].join("|");
}

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
      fields = decryptStoredPlatformDataForUser(row.encrypted_session, userId) as SessionData | Fields;
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

  const successfulResults = results.filter((result) => result.fetched);

  const items = successfulResults
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
      if (result.authMode === "credentials") {
        await client.query(
          "update platform_sessions set session_valid = null, session_checked_at = null where user_id = $1 and platform = $2",
          [userId, result.platform]
        );
      } else if (result.expired) {
        await client.query(
          "update platform_sessions set session_valid = false, session_checked_at = now() where user_id = $1 and platform = $2",
          [userId, result.platform]
        );
      } else if (result.fetched) {
        await client.query(
          "update platform_sessions set session_valid = true, session_checked_at = now() where user_id = $1 and platform = $2",
          [userId, result.platform]
        );
      }
    }

    const successfulPlatforms = successfulResults.map((result) => result.platform);
    const existingCompletedMap = new Map<string, boolean>();
    if (successfulPlatforms.length > 0) {
      const existingRows = await client.query(
        `
        select platform, title, course, extract(epoch from due_at)::bigint as due, url, completed
        from deadlines
        where user_id = $1 and platform = any($2::text[])
        `,
        [userId, successfulPlatforms]
      );

      for (const row of existingRows.rows) {
        const key = getDeadlineKey({
          platform: row.platform,
          title: row.title,
          course: row.course,
          due: Number(row.due),
          url: row.url,
        });
        existingCompletedMap.set(key, Boolean(row.completed));
      }

      await client.query(
        "delete from deadlines where user_id = $1 and platform = any($2::text[])",
        [userId, successfulPlatforms]
      );
    }

    for (const item of items) {
      const itemKey = getDeadlineKey(item);
      const completed = isSubmittedStatus(item.status)
        ? true
        : Boolean(item.completed) || Boolean(existingCompletedMap.get(itemKey));
      await client.query(
        `
        insert into deadlines (user_id, platform, title, course, due_at, status, completed, url)
        values ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8)
        `,
        [
          userId,
          item.platform,
          item.title,
          item.course,
          item.due,
          item.status ?? null,
          completed,
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