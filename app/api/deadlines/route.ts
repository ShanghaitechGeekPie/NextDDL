import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isSubmittedStatus } from '@/lib/deadline-status'

type DeadlineItem = {
  platform?: string
  title: string
  course: string
  due: number
  status?: string
  url: string
  completed?: boolean
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await pool.query(
    `
    select id, platform, title, course, due_at, status, completed, url
    from deadlines
    where user_id = $1
    order by due_at asc
    `,
    [user.id]
  )

  const items = result.rows.map((row) => {
    const due = Math.floor(new Date(row.due_at).getTime() / 1000)
    const completed = Boolean(row.completed) || isSubmittedStatus(row.status)
    return {
      id: row.id,
      platform: row.platform,
      title: row.title,
      course: row.course,
      due,
      status: row.status,
      completed,
      url: row.url,
    }
  })

  return NextResponse.json({ items })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const items: DeadlineItem[] = body.items ?? []

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`delete from deadlines where user_id = $1 and platform <> 'manual'`, [user.id])

    for (const item of items) {
      await client.query(
        `
        insert into deadlines (user_id, platform, title, course, due_at, status, completed, url)
        values ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8)
        `,
        [
          user.id,
          item.platform ?? 'unknown',
          item.title,
          item.course,
          item.due,
          item.status ?? null,
          Boolean(item.completed),
          item.url,
        ]
      )
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