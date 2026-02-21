import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getPublicOrigin } from '@/lib/public-origin'

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session')
  const pathname = request.nextUrl.pathname

  if (!session && pathname !== '/login' && pathname !== '/auth/callback') {
    const origin = getPublicOrigin(request)
    return NextResponse.redirect(new URL('/login', origin))
  }

  return NextResponse.next()
}
