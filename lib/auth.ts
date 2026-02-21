import { cookies } from "next/headers";
import { pool } from "./db";
export async function getCurrentUser() {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");  
    if (!sessionCookie) {
        return null;
    }
    const result = await pool.query(
        `
        select users.*
        from sessions
        join users on sessions.user_id = users.id
        where sessions.id = $1
        and sessions.expires_at > now()
        `,
        [sessionCookie.value]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
}