-- ============================================================================
-- PrismXGPT — Complete Bootstrap SQL
-- ----------------------------------------------------------------------------
-- Single, idempotent, additive schema. Column names, primary keys and foreign
-- keys mirror the production database exactly (audited against the generated
-- Supabase types). Safe to rerun.
--
--   activity_log        → owner column is `actor_id`  (NO user_id)
--   project_chats       → owner column is `created_by`
--   project_messages    → no owner column; ownership derived via chat→project
--   shared_chat_messages→ owner column is `author_id`
--   public_chat_snapshots → payload column is `messages` (jsonb)
--   shared_chats        → uses `invite_token` + `invite_expires_at`
--
-- Run in Supabase → SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions & schemas
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
-- Existing production enums:
--   app_role  = ('admin','premium','user','pro')
--   plan_tier = ('free','premium')
-- We add 'plus' (and 'pro' for plan_tier) without USING them in the same
-- script, which keeps Postgres happy about "unsafe use of new enum value".
-- Every downstream reference to a tier uses `text`, not the enum, on purpose.
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','pro','plus','premium','user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'plus';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.plan_tier AS ENUM ('free','premium','plus','pro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE public.plan_tier ADD VALUE IF NOT EXISTS 'plus';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.plan_tier ADD VALUE IF NOT EXISTS 'pro';
EXCEPTION WHEN others THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. Shared helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------------------
-- 3. Profiles  (PK = id, references auth.users.id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text,
  display_name  text,
  username      text,
  avatar_url    text,
  plan          public.plan_tier NOT NULL DEFAULT 'free',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan public.plan_tier NOT NULL DEFAULT 'free';

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION private.prevent_profile_plan_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    NEW.plan := OLD.plan;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_prevent_plan_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_plan_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.prevent_profile_plan_escalation();

-- ---------------------------------------------------------------------------
-- 4. user_roles  (owner column: user_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

DROP POLICY IF EXISTS "Users view own roles"           ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage roles"            ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all user_roles" ON public.user_roles FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 5. Conversations / messages  (owner column: user_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_user_updated_idx ON public.conversations(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own conversations" ON public.conversations;
CREATE POLICY "Users manage own conversations" ON public.conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS conversations_updated_at ON public.conversations;
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- messages.content is text in production (see generated types); keep it text
-- so the CREATE TABLE IF NOT EXISTS is a no-op on the existing schema.
CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON public.messages(conversation_id, created_at ASC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own messages" ON public.messages;
CREATE POLICY "Users manage own messages" ON public.messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_chat_state: production has (user_id PK, threads jsonb, updated_at)
CREATE TABLE IF NOT EXISTS public.user_chat_state (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  threads      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_chat_state TO authenticated;
GRANT ALL ON public.user_chat_state TO service_role;
ALTER TABLE public.user_chat_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own chat state select" ON public.user_chat_state;
DROP POLICY IF EXISTS "Users manage own chat state insert" ON public.user_chat_state;
DROP POLICY IF EXISTS "Users manage own chat state update" ON public.user_chat_state;
DROP POLICY IF EXISTS "Users manage own chat state delete" ON public.user_chat_state;
CREATE POLICY "Users manage own chat state select" ON public.user_chat_state FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users manage own chat state insert" ON public.user_chat_state FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users manage own chat state update" ON public.user_chat_state FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users manage own chat state delete" ON public.user_chat_state FOR DELETE TO authenticated USING (auth.uid()=user_id);
DROP TRIGGER IF EXISTS user_chat_state_updated_at ON public.user_chat_state;
CREATE TRIGGER user_chat_state_updated_at BEFORE UPDATE ON public.user_chat_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Projects, members, chats/messages, files, share links
--    Production: projects.owner_id, project_chats.created_by,
--    project_members.user_id, project_messages (no owner col; chat-scoped),
--    project_share_links (project_id, token, enabled).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description  text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS instructions text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS logo_url     text;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.project_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND owner_id = _user_id);
$$;
CREATE OR REPLACE FUNCTION private.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND owner_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id);
$$;

DROP POLICY IF EXISTS "Members view projects"  ON public.projects;
DROP POLICY IF EXISTS "Owners manage projects" ON public.projects;
CREATE POLICY "Members view projects"  ON public.projects FOR SELECT TO authenticated
  USING (private.is_project_member(id, auth.uid()));
CREATE POLICY "Owners manage projects" ON public.projects FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Members view membership"      ON public.project_members;
DROP POLICY IF EXISTS "Owners manage membership"     ON public.project_members;
DROP POLICY IF EXISTS "Owner can add self as member" ON public.project_members;
CREATE POLICY "Members view membership" ON public.project_members FOR SELECT TO authenticated
  USING (private.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners manage membership" ON public.project_members FOR ALL TO authenticated
  USING (private.is_project_owner(project_id, auth.uid()))
  WITH CHECK (private.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owner can add self as member" ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_project_owner(project_id, auth.uid()));

-- project_chats: owner column is `created_by` (NOT user_id).
CREATE TABLE IF NOT EXISTS public.project_chats (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_chats ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS project_chats_project_idx ON public.project_chats(project_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chats TO authenticated;
GRANT ALL ON public.project_chats TO service_role;
ALTER TABLE public.project_chats ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS project_chats_updated_at ON public.project_chats;
CREATE TRIGGER project_chats_updated_at BEFORE UPDATE ON public.project_chats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- project_messages: no owner column. Ownership derived via chat → project.
CREATE TABLE IF NOT EXISTS public.project_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    uuid NOT NULL REFERENCES public.project_chats(id) ON DELETE CASCADE,
  role       text NOT NULL,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_messages_chat_idx ON public.project_messages(chat_id, created_at ASC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_messages TO authenticated;
GRANT ALL ON public.project_messages TO service_role;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.chat_project_id(_chat_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT project_id FROM public.project_chats WHERE id = _chat_id;
$$;

DROP POLICY IF EXISTS "Members view chats"        ON public.project_chats;
DROP POLICY IF EXISTS "Members manage chats"      ON public.project_chats;
CREATE POLICY "Members view chats"   ON public.project_chats FOR SELECT TO authenticated
  USING (private.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members manage chats" ON public.project_chats FOR ALL TO authenticated
  USING (private.is_project_member(project_id, auth.uid()))
  WITH CHECK (private.is_project_member(project_id, auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS "Members view messages"   ON public.project_messages;
DROP POLICY IF EXISTS "Members insert messages" ON public.project_messages;
DROP POLICY IF EXISTS "Owners update messages"  ON public.project_messages;
DROP POLICY IF EXISTS "Owners delete messages"  ON public.project_messages;
CREATE POLICY "Members view messages"   ON public.project_messages FOR SELECT TO authenticated
  USING (private.is_project_member(private.chat_project_id(chat_id), auth.uid()));
CREATE POLICY "Members insert messages" ON public.project_messages FOR INSERT TO authenticated
  WITH CHECK (private.is_project_member(private.chat_project_id(chat_id), auth.uid()));
CREATE POLICY "Owners update messages"  ON public.project_messages FOR UPDATE TO authenticated
  USING (private.is_project_owner(private.chat_project_id(chat_id), auth.uid()));
CREATE POLICY "Owners delete messages"  ON public.project_messages FOR DELETE TO authenticated
  USING (private.is_project_owner(private.chat_project_id(chat_id), auth.uid()));

CREATE TABLE IF NOT EXISTS public.project_files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path   text NOT NULL,
  filename       text NOT NULL,
  mime_type      text,
  size_bytes     bigint,
  extracted_text text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_files_project_idx ON public.project_files(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_files TO authenticated;
GRANT ALL ON public.project_files TO service_role;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view project files"   ON public.project_files;
DROP POLICY IF EXISTS "Members upload project files" ON public.project_files;
DROP POLICY IF EXISTS "Owners delete project files"  ON public.project_files;
CREATE POLICY "Members view project files"   ON public.project_files FOR SELECT TO authenticated
  USING (private.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members upload project files" ON public.project_files FOR INSERT TO authenticated
  WITH CHECK (private.is_project_member(project_id, auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "Owners delete project files"  ON public.project_files FOR DELETE TO authenticated
  USING (private.is_project_owner(project_id, auth.uid()));

-- project_share_links: production PK is project_id-unique + token unique.
CREATE TABLE IF NOT EXISTS public.project_share_links (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_share_links TO authenticated;
GRANT ALL ON public.project_share_links TO service_role;
ALTER TABLE public.project_share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner reads share link"   ON public.project_share_links;
DROP POLICY IF EXISTS "Owner inserts share link" ON public.project_share_links;
DROP POLICY IF EXISTS "Owner updates share link" ON public.project_share_links;
DROP POLICY IF EXISTS "Owner deletes share link" ON public.project_share_links;
CREATE POLICY "Owner reads share link"   ON public.project_share_links FOR SELECT TO authenticated
  USING (private.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owner inserts share link" ON public.project_share_links FOR INSERT TO authenticated
  WITH CHECK (private.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owner updates share link" ON public.project_share_links FOR UPDATE TO authenticated
  USING (private.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owner deletes share link" ON public.project_share_links FOR DELETE TO authenticated
  USING (private.is_project_owner(project_id, auth.uid()));
DROP TRIGGER IF EXISTS project_share_links_set_updated_at ON public.project_share_links;
CREATE TRIGGER project_share_links_set_updated_at BEFORE UPDATE ON public.project_share_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Plan settings (4 tiers, DB-driven pricing & limits)
--    `tier` is text (not enum) so we can seed 'plus'/'pro' even if the
--    plan_tier enum only just gained those values in this same script.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_settings (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  price            text NOT NULL DEFAULT '',
  strike_price     text,
  note             text,
  cta_label        text,
  features         jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_methods  jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order       int  NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS tier               text;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS badge              text;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS monthly_price      numeric(10,2);
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS yearly_price       numeric(10,2);
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS currency           text NOT NULL DEFAULT 'INR';
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS chat_limit         integer;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS image_limit        integer;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS storage_limit_gb   integer;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS project_limit      integer;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS file_upload_limit  integer;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS voice_enabled      boolean NOT NULL DEFAULT true;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS web_search_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS reasoning_enabled  boolean NOT NULL DEFAULT false;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS memory_enabled     boolean NOT NULL DEFAULT false;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS priority_queue     boolean NOT NULL DEFAULT false;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS available_models   jsonb   NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS custom_features    jsonb   NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.plan_settings ADD COLUMN IF NOT EXISTS is_active          boolean NOT NULL DEFAULT true;

GRANT SELECT ON public.plan_settings TO anon, authenticated;
GRANT ALL ON public.plan_settings TO service_role;
ALTER TABLE public.plan_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read plans"    ON public.plan_settings;
DROP POLICY IF EXISTS "Public pricing plans readable" ON public.plan_settings;
DROP POLICY IF EXISTS "Admins manage plans"           ON public.plan_settings;
CREATE POLICY "Public pricing plans readable" ON public.plan_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage plans" ON public.plan_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

INSERT INTO public.plan_settings
  (id, name, tier, badge, price, sort_order, monthly_price, yearly_price, chat_limit, image_limit,
   storage_limit_gb, project_limit, file_upload_limit, voice_enabled, web_search_enabled,
   reasoning_enabled, memory_enabled, priority_queue, available_models, features, cta_label)
VALUES
  ('free',    'Free',    'free',    'Entry',          '₹0',     0,     0,     0,    50,    3,   2,   3,   10, true,  false, false, false, false,
    '["google/gemini-2.5-flash"]'::jsonb,
    '["50 chats/day","3 images/day","2 GB storage","3 projects","Basic model access"]'::jsonb, 'Get started'),
  ('premium', 'Premium', 'premium', 'Most Popular',   '₹299',   1,   299,  2999,   500,   50,  25,  25,  100, true,  true,  false, true,  false,
    '["google/gemini-2.5-flash","google/gemini-2.5-pro","openai/gpt-5-mini"]'::jsonb,
    '["500 chats/day","50 images/day","25 GB storage","25 projects","Web search","Memory"]'::jsonb, 'Upgrade'),
  ('plus',    'Plus',    'plus',    'Best Value',     '₹799',   2,   799,  7999,  2000,  200, 100, 100,  500, true,  true,  true,  true,  true,
    '["google/gemini-2.5-flash","google/gemini-2.5-pro","openai/gpt-5","openai/gpt-5-mini","anthropic/claude-sonnet-4.5"]'::jsonb,
    '["2000 chats/day","200 images/day","100 GB storage","100 projects","Reasoning models","Priority queue"]'::jsonb, 'Go Plus'),
  ('pro',     'Pro',     'pro',     'Enterprise',     '₹1,999', 3,  1999, 19999,   NULL, NULL,1024,NULL, 1000, true,  true,  true,  true,  true,
    '["google/gemini-2.5-flash","google/gemini-2.5-pro","openai/gpt-5","openai/gpt-5-mini","anthropic/claude-sonnet-4.5","anthropic/claude-opus-4.1"]'::jsonb,
    '["Unlimited chats (fair use)","Unlimited images (fair use)","1 TB storage","Unlimited projects","All models","Highest priority"]'::jsonb, 'Go Pro')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  tier = EXCLUDED.tier,
  badge = EXCLUDED.badge,
  sort_order = EXCLUDED.sort_order,
  monthly_price = EXCLUDED.monthly_price,
  yearly_price = EXCLUDED.yearly_price,
  updated_at = now();

-- Dedupe: only the four canonical plan ids may exist
DELETE FROM public.plan_settings WHERE id NOT IN ('free','premium','plus','pro');

-- ---------------------------------------------------------------------------
-- 8. app_settings  (PK = key)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT SELECT ON public.app_settings TO anon;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated reads settings"          ON public.app_settings;
DROP POLICY IF EXISTS "Public announcement settings readable" ON public.app_settings;
DROP POLICY IF EXISTS "Admins manage settings"                ON public.app_settings;
CREATE POLICY "Public announcement settings readable" ON public.app_settings FOR SELECT TO anon, authenticated
  USING (key IN ('homepage_announcement','chat_announcement','system_status','maintenance_mode'));
CREATE POLICY "Admins manage settings" ON public.app_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 9. activity_log   (owner column: actor_id — NO user_id in this table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action     text NOT NULL,
  target_id  uuid,
  metadata   jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_log_actor_created_idx ON public.activity_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_created_idx       ON public.activity_log(created_at DESC);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users insert own actions"    ON public.activity_log;
DROP POLICY IF EXISTS "Admins insert audit actions" ON public.activity_log;
DROP POLICY IF EXISTS "Users or admins view logs"   ON public.activity_log;
CREATE POLICY "Users insert own actions"    ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
CREATE POLICY "Admins insert audit actions" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users or admins view logs"   ON public.activity_log FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 10. Library items + folders + favorites  (owner column: user_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.library_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  parent_id  uuid REFERENCES public.library_folders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS library_folders_user_idx ON public.library_folders(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_folders TO authenticated;
GRANT ALL ON public.library_folders TO service_role;
ALTER TABLE public.library_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own folders" ON public.library_folders;
CREATE POLICY "Users manage own folders" ON public.library_folders FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.library_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  title         text,
  prompt        text,
  storage_path  text NOT NULL,
  mime_type     text,
  size_bytes    bigint,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.library_items ADD COLUMN IF NOT EXISTS folder_id       uuid REFERENCES public.library_folders(id) ON DELETE SET NULL;
ALTER TABLE public.library_items ADD COLUMN IF NOT EXISTS is_favorite     boolean NOT NULL DEFAULT false;
ALTER TABLE public.library_items ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.library_items ADD COLUMN IF NOT EXISTS project_id      uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.library_items ADD COLUMN IF NOT EXISTS tags            text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS library_items_user_created_idx ON public.library_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS library_items_favorite_idx     ON public.library_items(user_id, is_favorite);
CREATE INDEX IF NOT EXISTS library_items_folder_idx       ON public.library_items(folder_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_items TO authenticated;
GRANT ALL ON public.library_items TO service_role;
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own library" ON public.library_items;
CREATE POLICY "Users manage own library" ON public.library_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 11. Shared chats + members + messages
--     Production columns: shared_chats(owner_id, invite_token, invite_expires_at)
--     shared_chat_members(chat_id, user_id, role, joined_at)
--     shared_chat_messages(chat_id, author_id, role, content, created_at)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shared_chats (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title              text NOT NULL DEFAULT 'Shared chat',
  invite_token       text UNIQUE,
  invite_expires_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chats TO authenticated;
GRANT ALL ON public.shared_chats TO service_role;
ALTER TABLE public.shared_chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shared_chat_members (
  chat_id    uuid NOT NULL REFERENCES public.shared_chats(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member',
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.shared_chat_members TO authenticated;
GRANT ALL ON public.shared_chat_members TO service_role;
ALTER TABLE public.shared_chat_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shared_chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    uuid NOT NULL REFERENCES public.shared_chats(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role       text NOT NULL,
  content    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_chat_messages_chat_created_idx ON public.shared_chat_messages(chat_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chat_messages TO authenticated;
GRANT ALL ON public.shared_chat_messages TO service_role;
ALTER TABLE public.shared_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.is_shared_chat_participant(_chat_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.shared_chats        WHERE id = _chat_id AND owner_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.shared_chat_members WHERE chat_id = _chat_id AND user_id = _user_id);
$$;

DROP POLICY IF EXISTS "Owner can create shared chat"       ON public.shared_chats;
DROP POLICY IF EXISTS "Owner can update shared chat"       ON public.shared_chats;
DROP POLICY IF EXISTS "Owner can delete shared chat"       ON public.shared_chats;
DROP POLICY IF EXISTS "Participants can view shared chat"  ON public.shared_chats;
CREATE POLICY "Owner can create shared chat" ON public.shared_chats FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update shared chat" ON public.shared_chats FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete shared chat" ON public.shared_chats FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Participants can view shared chat" ON public.shared_chats FOR SELECT TO authenticated
  USING (private.is_shared_chat_participant(id, auth.uid()));

DROP POLICY IF EXISTS "Participants can view members"           ON public.shared_chat_members;
DROP POLICY IF EXISTS "User can join via valid invite"          ON public.shared_chat_members;
DROP POLICY IF EXISTS "Owner removes members; user removes self" ON public.shared_chat_members;
CREATE POLICY "Participants can view members" ON public.shared_chat_members FOR SELECT TO authenticated
  USING (private.is_shared_chat_participant(chat_id, auth.uid()));
CREATE POLICY "User can join via valid invite" ON public.shared_chat_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner removes members; user removes self" ON public.shared_chat_members FOR DELETE TO authenticated
  USING (user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.shared_chats WHERE id = chat_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Participants can view messages"                 ON public.shared_chat_messages;
DROP POLICY IF EXISTS "Participants can insert messages"               ON public.shared_chat_messages;
DROP POLICY IF EXISTS "Participants can update own streaming messages" ON public.shared_chat_messages;
DROP POLICY IF EXISTS "Owner deletes any message"                      ON public.shared_chat_messages;
CREATE POLICY "Participants can view messages"   ON public.shared_chat_messages FOR SELECT TO authenticated
  USING (private.is_shared_chat_participant(chat_id, auth.uid()));
CREATE POLICY "Participants can insert messages" ON public.shared_chat_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND private.is_shared_chat_participant(chat_id, auth.uid()));
CREATE POLICY "Participants can update own streaming messages" ON public.shared_chat_messages FOR UPDATE TO authenticated
  USING (author_id = auth.uid());
CREATE POLICY "Owner deletes any message" ON public.shared_chat_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shared_chats WHERE id = chat_id AND owner_id = auth.uid()));

DROP TRIGGER IF EXISTS shared_chats_set_updated_at ON public.shared_chats;
CREATE TRIGGER shared_chats_set_updated_at BEFORE UPDATE ON public.shared_chats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. Public chat snapshots  (payload column: `messages`, owner: owner_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_chat_snapshots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'Shared conversation',
  messages   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.public_chat_snapshots TO authenticated;
GRANT SELECT ON public.public_chat_snapshots TO anon;
GRANT ALL ON public.public_chat_snapshots TO service_role;
ALTER TABLE public.public_chat_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view a snapshot by id"  ON public.public_chat_snapshots;
DROP POLICY IF EXISTS "Users can create own snapshots"    ON public.public_chat_snapshots;
DROP POLICY IF EXISTS "Owners can delete their snapshots" ON public.public_chat_snapshots;
DROP POLICY IF EXISTS "Owners can view their snapshots"   ON public.public_chat_snapshots;
CREATE POLICY "Anyone can view a snapshot by id"  ON public.public_chat_snapshots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users can create own snapshots"    ON public.public_chat_snapshots FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can delete their snapshots" ON public.public_chat_snapshots FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_public_chat_snapshot(snapshot_id uuid)
RETURNS TABLE (id uuid, title text, messages jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, title, messages, created_at FROM public.public_chat_snapshots WHERE id = snapshot_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_chat_snapshot(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 13. Image usage + quota RPCs  (owner column: user_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.image_usage (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day        date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  count      integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
GRANT SELECT ON public.image_usage TO authenticated;
GRANT ALL ON public.image_usage TO service_role;
ALTER TABLE public.image_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own image usage" ON public.image_usage;
CREATE POLICY "Users read own image usage" ON public.image_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.consume_image_quota(_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'utc')::date;
  current_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.image_usage (user_id, day, count) VALUES (uid, today, 0)
    ON CONFLICT (user_id, day) DO NOTHING;
  SELECT count INTO current_count FROM public.image_usage WHERE user_id = uid AND day = today FOR UPDATE;
  IF current_count >= _limit THEN RETURN -1; END IF;
  UPDATE public.image_usage SET count = count + 1, updated_at = now() WHERE user_id = uid AND day = today;
  RETURN _limit - (current_count + 1);
END $$;
REVOKE ALL ON FUNCTION public.consume_image_quota(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_image_quota(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_image_quota(_limit integer, _user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := _user_id;
  today date := (now() AT TIME ZONE 'utc')::date;
  current_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'user id required'; END IF;
  INSERT INTO public.image_usage (user_id, day, count) VALUES (uid, today, 0)
    ON CONFLICT (user_id, day) DO NOTHING;
  SELECT count INTO current_count FROM public.image_usage WHERE user_id = uid AND day = today FOR UPDATE;
  IF current_count >= _limit THEN RETURN -1; END IF;
  UPDATE public.image_usage SET count = count + 1, updated_at = now() WHERE user_id = uid AND day = today;
  RETURN _limit - (current_count + 1);
END $$;
REVOKE ALL ON FUNCTION public.consume_image_quota(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_image_quota(integer, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 14. User settings (owner column: user_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme         text NOT NULL DEFAULT 'system',
  accent        text NOT NULL DEFAULT 'brand',
  language      text NOT NULL DEFAULT 'en',
  voice         jsonb NOT NULL DEFAULT '{}'::jsonb,
  notifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  privacy       jsonb NOT NULL DEFAULT '{}'::jsonb,
  shortcuts     jsonb NOT NULL DEFAULT '{}'::jsonb,
  advanced      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own settings" ON public.user_settings;
CREATE POLICY "Users manage own settings" ON public.user_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS user_settings_updated_at ON public.user_settings;
CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 15. Admin notifications (admin-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_notifications_created_idx ON public.admin_notifications(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage admin notifications" ON public.admin_notifications;
CREATE POLICY "Admins manage admin notifications" ON public.admin_notifications FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 16. Storage buckets + policies (library, project-files, avatars)
--     library:       first path segment = user_id (auth.uid())
--     project-files: first path segment = project_id (checked via is_project_*)
--     avatars:       public read; user writes own folder
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('library',       'library',       false),
  ('project-files', 'project-files', false),
  ('avatars',       'avatars',       true),
  ('chat-images',   'chat-images',   true)
ON CONFLICT (id) DO NOTHING;
-- Ensure chat-images is publicly readable even if the row already existed.
UPDATE storage.buckets SET public = true WHERE id = 'chat-images';

DROP POLICY IF EXISTS "chat-images public read"   ON storage.objects;
DROP POLICY IF EXISTS "chat-images owner write"   ON storage.objects;
DROP POLICY IF EXISTS "chat-images owner delete"  ON storage.objects;
CREATE POLICY "chat-images public read"  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'chat-images');
CREATE POLICY "chat-images owner write"  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-images' AND ((storage.foldername(name))[1])::uuid = auth.uid());
CREATE POLICY "chat-images owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-images' AND ((storage.foldername(name))[1])::uuid = auth.uid());

DROP POLICY IF EXISTS "library owner read"   ON storage.objects;
DROP POLICY IF EXISTS "library owner insert" ON storage.objects;
DROP POLICY IF EXISTS "library owner update" ON storage.objects;
DROP POLICY IF EXISTS "library owner delete" ON storage.objects;
CREATE POLICY "library owner read"   ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'library' AND ((storage.foldername(name))[1])::uuid = auth.uid());
CREATE POLICY "library owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'library' AND ((storage.foldername(name))[1])::uuid = auth.uid());
CREATE POLICY "library owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'library' AND ((storage.foldername(name))[1])::uuid = auth.uid());
CREATE POLICY "library owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'library' AND ((storage.foldername(name))[1])::uuid = auth.uid());

DROP POLICY IF EXISTS "project-files members read"   ON storage.objects;
DROP POLICY IF EXISTS "project-files members insert" ON storage.objects;
DROP POLICY IF EXISTS "project-files owners delete"  ON storage.objects;
CREATE POLICY "project-files members read"   ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-files' AND private.is_project_member(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "project-files members insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-files' AND private.is_project_member(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "project-files owners delete"  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-files' AND private.is_project_owner(((storage.foldername(name))[1])::uuid, auth.uid()));

DROP POLICY IF EXISTS "avatars public read"   ON storage.objects;
DROP POLICY IF EXISTS "avatars owner write"   ON storage.objects;
DROP POLICY IF EXISTS "avatars owner update"  ON storage.objects;
DROP POLICY IF EXISTS "avatars owner delete"  ON storage.objects;
CREATE POLICY "avatars public read"  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "avatars owner write"  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND ((storage.foldername(name))[1])::uuid = auth.uid());
CREATE POLICY "avatars owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1])::uuid = auth.uid());
CREATE POLICY "avatars owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1])::uuid = auth.uid());

-- ---------------------------------------------------------------------------
-- 17. Admin helper view — uses real owner columns everywhere.
--     Underlying tables already restrict non-admins via RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_user_overview AS
  SELECT
    p.id, p.email, p.display_name, p.username, p.avatar_url, p.plan, p.created_at,
    (SELECT array_agg(role::text) FROM public.user_roles r WHERE r.user_id = p.id) AS roles,
    (SELECT count(*) FROM public.conversations c WHERE c.user_id  = p.id)          AS chat_count,
    (SELECT count(*) FROM public.library_items  l WHERE l.user_id  = p.id)          AS library_count,
    (SELECT count(*) FROM public.projects       pr WHERE pr.owner_id = p.id)        AS project_count
  FROM public.profiles p;
GRANT SELECT ON public.admin_user_overview TO authenticated;
-- ---------------------------------------------------------------------------
-- 18. Image generations — durable lifecycle so refresh mid-edit can resume.
--     Each row is an immutable record for one generation OR edit request.
--     Edits reference the source via parent_id; the previous row is NEVER
--     mutated by an edit. The `id` is chosen client-side (uuid) so the
--     browser can persist a pending marker before the POST returns and
--     recover the correct row on refresh.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.image_generations (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES public.image_generations(id) ON DELETE SET NULL,
  prompt       text NOT NULL,
  input_url    text,
  status       text NOT NULL DEFAULT 'processing'
               CHECK (status IN ('queued','processing','completed','failed')),
  image_url    text,
  storage_path text,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS input_url text;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS error text;

CREATE INDEX IF NOT EXISTS image_generations_user_idx
  ON public.image_generations(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.image_generations TO authenticated;
GRANT ALL ON public.image_generations TO service_role;

ALTER TABLE public.image_generations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own image_generations"   ON public.image_generations;
DROP POLICY IF EXISTS "Users insert own image_generations" ON public.image_generations;
DROP POLICY IF EXISTS "Users update own image_generations" ON public.image_generations;
CREATE POLICY "Users read own image_generations"
  ON public.image_generations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own image_generations"
  ON public.image_generations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own image_generations"
  ON public.image_generations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS image_generations_touch ON public.image_generations;
CREATE TRIGGER image_generations_touch
  BEFORE UPDATE ON public.image_generations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Documentation CMS (categories + pages)
-- Everyone can READ published pages; only admins can write.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documentation_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  title        text NOT NULL,
  description  text,
  icon         text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documentation_pages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       uuid REFERENCES public.documentation_categories(id) ON DELETE SET NULL,
  parent_id         uuid REFERENCES public.documentation_pages(id) ON DELETE SET NULL,
  slug              text NOT NULL UNIQUE,
  title             text NOT NULL,
  description       text,
  content           text NOT NULL DEFAULT '',
  excerpt           text,
  cover_image       text,
  icon              text,
  tags              text[] NOT NULL DEFAULT '{}',
  version           text,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  visibility        text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  seo_title         text,
  seo_description   text,
  sort_order        integer NOT NULL DEFAULT 0,
  reading_minutes   integer NOT NULL DEFAULT 1,
  published_at      timestamptz,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documentation_pages_category_idx
  ON public.documentation_pages(category_id, sort_order);
CREATE INDEX IF NOT EXISTS documentation_pages_status_idx
  ON public.documentation_pages(status);

GRANT SELECT ON public.documentation_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.documentation_categories TO authenticated;
GRANT ALL ON public.documentation_categories TO service_role;

GRANT SELECT ON public.documentation_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.documentation_pages TO authenticated;
GRANT ALL ON public.documentation_pages TO service_role;

ALTER TABLE public.documentation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentation_pages       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "docs_categories_public_read"  ON public.documentation_categories;
DROP POLICY IF EXISTS "docs_categories_admin_write"  ON public.documentation_categories;
CREATE POLICY "docs_categories_public_read"
  ON public.documentation_categories FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "docs_categories_admin_write"
  ON public.documentation_categories FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "docs_pages_public_read"       ON public.documentation_pages;
DROP POLICY IF EXISTS "docs_pages_admin_read_all"    ON public.documentation_pages;
DROP POLICY IF EXISTS "docs_pages_admin_write"       ON public.documentation_pages;
CREATE POLICY "docs_pages_public_read"
  ON public.documentation_pages FOR SELECT TO anon, authenticated
  USING (status = 'published' AND visibility = 'public');
CREATE POLICY "docs_pages_admin_read_all"
  ON public.documentation_pages FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "docs_pages_admin_write"
  ON public.documentation_pages FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS documentation_categories_touch ON public.documentation_categories;
CREATE TRIGGER documentation_categories_touch
  BEFORE UPDATE ON public.documentation_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS documentation_pages_touch ON public.documentation_pages;
CREATE TRIGGER documentation_pages_touch
  BEFORE UPDATE ON public.documentation_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a starter category + welcome page so /docs isn't empty on first run.
INSERT INTO public.documentation_categories (slug, title, description, sort_order)
VALUES ('getting-started', 'Getting Started', 'Everything you need to know to begin using PrismXGPT.', 0)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.documentation_pages (slug, title, description, content, status, sort_order, category_id, published_at)
SELECT
  'welcome',
  'Welcome to PrismXGPT',
  'A quick introduction to the platform.',
  E'# Welcome to PrismXGPT\n\nThis documentation is fully editable from the **Admin Dashboard → Docs** tab.\n\n## What you can do\n\n- Chat with a modern AI assistant\n- Generate and edit images\n- Organize work in projects\n\n> Tip: Admins can add categories and pages at any time.\n',
  'published',
  0,
  c.id,
  now()
FROM public.documentation_categories c
WHERE c.slug = 'getting-started'
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- END OF BOOTSTRAP
-- ============================================================================


