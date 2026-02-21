# NextDDL

NextDDL is a deadline aggregation app for multiple platforms (Hydro, Gradescope, Blackboard) with a Next.js frontend, a Python scraper API, and a PostgreSQL database.

## Tech Stack

- Next.js (App Router)
- PostgreSQL
- Python Flask API

## Project Structure

- app/: Next.js App Router pages and routes
- api/: Python scraper API
- lib/: server utilities (auth, db, crypto)
- components/: UI components
- scripts/: SQL/init helpers

## Requirements

- Node.js 20+
- pnpm
- Python 3.13
- PostgreSQL 16 (local or container)

## Environment Variables

Create a .env file in the project root:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/nextddl
PYTHON_API_BASE_URL=http://127.0.0.1:5000
SESSION_SECRET=change-me
PLATFORM_SESSION_SECRET=change-me

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
- NEXT_PUBLIC_* are injected at build time.
- For container networking, use db and api hostnames instead of localhost.

## Local Development

1) Install dependencies

```
pnpm install
```

2) Start PostgreSQL (local or container), then run migrations

If you use the SQL initializer:

```
psql -d nextddl -f scripts/init.sql
```

3) Start the Python API

```
python api/index.py
```

4) Start the Next.js app

```
pnpm dev
```

Open http://localhost:3000

## Installation with Docker

### Using Docker Compose (Recommended)

1) Clone the repository

```
git clone https://github.com/ShanghaitechGeekPie/NextDDL.git
cd nextddl
```

2) Configure environment variables

Create a .env file in the project root and set values (examples):

```
DATABASE_URL=postgresql://nextddl:nextddl@db:5432/nextddl
SESSION_SECRET=change-me
PLATFORM_SESSION_SECRET=change-me

NEXT_PUBLIC_CASDOOR_SERVER_URL=https://your-casdoor-server.example.com
NEXT_PUBLIC_CASDOOR_CLIENT_ID=your-client-id
NEXT_PUBLIC_CASDOOR_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_CASDOOR_ORG_NAME=your-org
NEXT_PUBLIC_CASDOOR_APP_NAME=your-app
NEXT_PUBLIC_CASDOOR_REDIRECT_URI=https://your-domain.example.com/auth/callback
NEXT_PUBLIC_CASDOOR_SIGNIN_URL=https://your-casdoor-server.example.com/login/oauth/authorize
NEXT_PUBLIC_CASDOOR_BASE_URL=https://your-casdoor-server.example.com
```

Notes:
- NEXT_PUBLIC_* are injected at build time by Docker build args.
- For local Casdoor testing, you can replace the URLs with http://localhost:8000.

3) Start with Docker Compose

```
docker compose -f docker-compose.prod.yml up -d
```

This will start the app, the Python API, and PostgreSQL.

4) Stop services

```
docker compose -f docker-compose.prod.yml down
```

### Using Docker Build Directly

1) Build images

```
docker build -f Dockerfile.api -t nextddl-api .
docker build -f Dockerfile.web -t nextddl-web \
	--build-arg NEXT_PUBLIC_CASDOOR_SERVER_URL=https://your-casdoor-server.example.com \
	--build-arg NEXT_PUBLIC_CASDOOR_CLIENT_ID=your-client-id \
	--build-arg NEXT_PUBLIC_CASDOOR_CLIENT_SECRET=your-client-secret \
	--build-arg NEXT_PUBLIC_CASDOOR_ORG_NAME=your-org \
	--build-arg NEXT_PUBLIC_CASDOOR_APP_NAME=your-app \
	--build-arg NEXT_PUBLIC_CASDOOR_REDIRECT_URI=https://your-domain.example.com/auth/callback \
	--build-arg NEXT_PUBLIC_CASDOOR_SIGNIN_URL=https://your-casdoor-server.example.com/login/oauth/authorize \
	--build-arg NEXT_PUBLIC_CASDOOR_BASE_URL=https://your-casdoor-server.example.com \
	.
```

2) Run containers

```
docker run -d \
	-p 5000:5000 \
	--name nextddl-api \
	nextddl-api

docker run -d \
	-p 3000:3000 \
	-e DATABASE_URL=postgresql://nextddl:nextddl@host.docker.internal:5432/nextddl \
	-e PYTHON_API_BASE_URL=http://host.docker.internal:5000 \
	-e SESSION_SECRET=change-me \
	-e PLATFORM_SESSION_SECRET=change-me \
	--name nextddl-web \
	nextddl-web
```

The application will be available at http://localhost:3000

## Useful Commands

- Refresh DDLs: POST /api/refresh-deadlines (requires login)
- Get ICS link: GET /api/ics-token (requires login)

## License

MIT
