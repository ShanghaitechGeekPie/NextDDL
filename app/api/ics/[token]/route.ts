import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { createEvents, EventAttributes } from "ics";
import { refreshUserDeadlines } from "@/lib/deadlines";

function toIcsEvents(rows: Array<{ title: string | null; course: string | null; due_at: Date | null; status: string | null; url: string | null }>) {
  const events: EventAttributes[] = rows.map((row) => {
    if (!row.title || !row.due_at) {
      return null;
    }
    const due = new Date(row.due_at);
    if (Number.isNaN(due.getTime())) {
      return null;
    }
    const descriptionParts = [row.course ?? "", row.status ? `Status: ${row.status}` : ""].filter(Boolean);
    const url = row.url?.trim() ? row.url : undefined;
    return {
      title: row.title,
      description: descriptionParts.join("\n"),
      location: url,
      url,
      start: [
        due.getFullYear(),
        due.getMonth() + 1,
        due.getDate(),
        due.getHours(),
        due.getMinutes(),
      ],
      duration: { hours: 1 },
    } as EventAttributes;
  }).filter(Boolean) as EventAttributes[];

  return events;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const tokenResult = await pool.query(
    "select user_id from ics_tokens where token = $1 limit 1",
    [token]
  );

  if (tokenResult.rows.length === 0) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  const userId = tokenResult.rows[0].user_id;
  try {
    await refreshUserDeadlines(userId);
  } catch (error) {
    console.error(error);
  }
  const deadlines = await pool.query(
    `
    select title, course, due_at, status, url
    from deadlines
    where user_id = $1
    order by due_at asc
    `,
    [userId]
  );

  const events = toIcsEvents(deadlines.rows);

  if (events.length === 0) {
    const emptyCalendar = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//NextDDL//EN\r\nEND:VCALENDAR\r\n";
    return new NextResponse(emptyCalendar, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  let value: string | undefined;
  try {
    const result = createEvents(events);
    if (result.error || !result.value) {
      console.error(result.error);
      value = undefined;
    } else {
      value = result.value;
    }
  } catch (error) {
    console.error(error);
    value = undefined;
  }

  if (!value) {
    const emptyCalendar = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//NextDDL//EN\r\nEND:VCALENDAR\r\n";
    return new NextResponse(emptyCalendar, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(value, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}