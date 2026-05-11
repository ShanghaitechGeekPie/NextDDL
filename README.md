# NextDDL

NextDDL is a deadline aggregation app for multiple platforms (Hydro, Gradescope, Blackboard) with a Next.js serverless API and a PostgreSQL database.

## Tech Stack

- Next.js 16.1.6 (App Router)
- PostgreSQL
- React 19

## Project Structure

- `app/`: Next.js App Router pages and routes
- `lib/`: server utilities (auth, db, crypto, deadlines)
- `components/`: UI components
- `public/`: static assets
- `scripts/`: database initialization

## Requirements

- Node.js 20+
- pnpm
- PostgreSQL 16

## Environment Variables

Create a `.env.local` file in the project root (see `.env.example` for reference):

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/nextddl
SESSION_SECRET=your-session-secret
PLATFORM_SESSION_SECRET=your-platform-secret
PLATFORM_RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
PLATFORM_RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
PUBLIC_BASE_URL=http://localhost:3000

NEXT_PUBLIC_CASDOOR_SERVER_URL=https://your-casdoor-server.example.com
NEXT_PUBLIC_CASDOOR_CLIENT_ID=your-client-id
NEXT_PUBLIC_CASDOOR_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_CASDOOR_ORG_NAME=your-org
NEXT_PUBLIC_CASDOOR_APP_NAME=your-app
NEXT_PUBLIC_CASDOOR_REDIRECT_URI=http://localhost:3000/auth/callback
NEXT_PUBLIC_CASDOOR_SIGNIN_URL=https://your-casdoor-server.example.com/login/oauth/authorize
NEXT_PUBLIC_CASDOOR_BASE_URL=https://your-casdoor-server.example.com
```

Notes:
- `NEXT_PUBLIC_*` variables are injected at build time
- For credentials mode, RSA keys are required (generate with: `openssl genrsa -out private.pem 2048`)
- Casdoor server URL can be `http://localhost:8000` for local testing

## Local Development

1) Install dependencies

```bash
pnpm install
```

2) Set up PostgreSQL

```bash
# Start PostgreSQL locally or use Docker
docker run -d --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:16

# Create database and tables
psql postgresql://postgres:password@localhost:5432 -f scripts/init.sql
```

3) Configure environment variables

Copy from `.env.example` and update:

```bash
cp .env.example .env.local
# Edit .env.local with your settings
```

4) Start the development server

```bash
pnpm dev
```

Open http://localhost:3000

## Deployment

Designed for serverless deployment on Vercel with Supabase PostgreSQL. For production deployment, refer to the official Vercel and Supabase documentation.

## Useful Commands

- Refresh DDLs: POST /api/refresh-deadlines (requires login)
- Get ICS link: GET /api/ics-token (requires login)

## License

MIT
