-- Init schema for local Postgres
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  geekpie_id text NOT NULL UNIQUE,
  nickname text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  ddl_retention_days integer DEFAULT 30,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  expires_at timestamp with time zone NOT NULL,
  casdoor_access_token text,
  casdoor_expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.platform_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  platform text NOT NULL,
  encrypted_session text NOT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  session_valid boolean,
  session_checked_at timestamp without time zone,
  CONSTRAINT platform_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT platform_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.deadlines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  platform text NOT NULL,
  title text NOT NULL,
  course text,
  due_at timestamp with time zone NOT NULL,
  status text,
  url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT deadlines_pkey PRIMARY KEY (id),
  CONSTRAINT deadlines_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.ics_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  token text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ics_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT ics_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
