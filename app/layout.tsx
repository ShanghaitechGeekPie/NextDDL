import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Next DDL',
  description: 'Check your DDL on one site - ShanghaiTech University',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}