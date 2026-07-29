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
-- 0a. Legacy cleanup for broken shared-chat objects
-- ---------------------------------------------------------------------------
-- Older project copies can contain policies/functions/triggers/views that point
-- at a bare relation named `shared`. That relation is not part of this schema;
-- the canonical tables are public.shared_chats, public.shared_chat_members and
-- public.shared_chat_messages. Clean those stale objects before creating or
-- replacing the current schema so reruns work on existing projects.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname IN (
          'sc_select', 'sc_insert', 'sc_update', 'sc_delete',
          'scm_select', 'scm_insert', 'scm_delete',
          'scmsg_select', 'scmsg_insert', 'scmsg_update', 'scmsg_delete'
        )
        OR (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
           ~* '(from|join|update|into|references)[[:space:]]+"?shared"?([^_[:alnum:]]|$)'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', item.policyname, item.schemaname, item.tablename);
  END LOOP;

  FOR item IN
    SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'private')
      AND c.relkind IN ('v', 'm')
      AND pg_get_viewdef(c.oid, true)
          ~* '(from|join|update|into|references)[[:space:]]+"?shared"?([^_[:alnum:]]|$)'
  LOOP
    IF item.relkind = 'm' THEN
      EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I.%I CASCADE', item.schema_name, item.relation_name);
    ELSE
      EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', item.schema_name, item.relation_name);
    END IF;
  END LOOP;

  FOR item IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname AS trigger_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname IN ('public', 'private')
      AND pg_get_triggerdef(t.oid)
          ~* '(from|join|update|into|references)[[:space:]]+"?shared"?([^_[:alnum:]]|$)'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', item.trigger_name, item.schema_name, item.table_name);
  END LOOP;

  FOR item IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args,
      p.prokind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prokind IN ('f', 'p')
      AND (
        (n.nspname = 'public' AND p.proname IN ('is_shared_chat_member', 'get_shared_chat_members'))
        OR pg_get_functiondef(p.oid)
           ~* '(from|join|update|into|references)[[:space:]]+"?shared"?([^_[:alnum:]]|$)'
      )
  LOOP
    IF item.prokind = 'p' THEN
      EXECUTE format('DROP PROCEDURE IF EXISTS %I.%I(%s) CASCADE', item.schema_name, item.function_name, item.args);
    ELSE
      EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', item.schema_name, item.function_name, item.args);
    END IF;
  END LOOP;
END $$;

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

-- Drop leftover policies/functions from an earlier schema generation that
-- referenced a now-nonexistent `shared` relation and caused
--   ERROR: 42P01: relation "shared" does not exist
-- on re-runs against existing projects. Safe/idempotent on fresh DBs.
DROP POLICY IF EXISTS sc_select    ON public.shared_chats;
DROP POLICY IF EXISTS sc_insert    ON public.shared_chats;
DROP POLICY IF EXISTS sc_update    ON public.shared_chats;
DROP POLICY IF EXISTS sc_delete    ON public.shared_chats;
DROP POLICY IF EXISTS scm_select   ON public.shared_chat_members;
DROP POLICY IF EXISTS scm_insert   ON public.shared_chat_members;
DROP POLICY IF EXISTS scm_delete   ON public.shared_chat_members;
DROP POLICY IF EXISTS scmsg_select ON public.shared_chat_messages;
DROP POLICY IF EXISTS scmsg_insert ON public.shared_chat_messages;
DROP POLICY IF EXISTS scmsg_update ON public.shared_chat_messages;
DROP POLICY IF EXISTS scmsg_delete ON public.shared_chat_messages;
DROP FUNCTION IF EXISTS public.is_shared_chat_member(uuid, uuid) CASCADE;


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
REVOKE ALL ON public.public_chat_snapshots FROM anon;
GRANT ALL ON public.public_chat_snapshots TO service_role;
ALTER TABLE public.public_chat_snapshots ENABLE ROW LEVEL SECURITY;
-- Snapshots are NEVER readable by anon/authenticated in bulk: the share page
-- fetches a single snapshot by unguessable id through the service-role server
-- route /api/public/snapshot/$id. Do not add a `USING (true)` policy here.
DROP POLICY IF EXISTS "Anyone can view a snapshot by id"  ON public.public_chat_snapshots;
DROP POLICY IF EXISTS "Users can create own snapshots"    ON public.public_chat_snapshots;
DROP POLICY IF EXISTS "Owners can delete their snapshots" ON public.public_chat_snapshots;
DROP POLICY IF EXISTS "Owners can view their snapshots"   ON public.public_chat_snapshots;
CREATE POLICY "Owners can view their snapshots"   ON public.public_chat_snapshots FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Users can create own snapshots"    ON public.public_chat_snapshots FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can delete their snapshots" ON public.public_chat_snapshots FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- The old public, anon-callable SECURITY DEFINER lookup allowed unrestricted
-- reads; it is removed in favour of the server-side service-role route.
DROP FUNCTION IF EXISTS public.get_public_chat_snapshot(uuid);

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
-- 17. Admin helper view — admin-only. The view owner may bypass RLS, so the
--     admin check is enforced INSIDE the view definition; a non-admin caller
--     always gets zero rows even when querying via the REST API.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.admin_user_overview
WITH (security_barrier = true) AS
  SELECT
    p.id, p.email, p.display_name, p.username, p.avatar_url, p.plan, p.created_at,
    (SELECT array_agg(role::text) FROM public.user_roles r WHERE r.user_id = p.id) AS roles,
    (SELECT count(*) FROM public.conversations c WHERE c.user_id  = p.id)          AS chat_count,
    (SELECT count(*) FROM public.library_items  l WHERE l.user_id  = p.id)          AS library_count,
    (SELECT count(*) FROM public.projects       pr WHERE pr.owner_id = p.id)        AS project_count
  FROM public.profiles p
  WHERE private.has_role(auth.uid(), 'admin');
REVOKE ALL ON public.admin_user_overview FROM anon;
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
  message_id   text,
  provider_request_id text,
  provider_job_id     text,
  prompt       text NOT NULL,
  input_url    text,
  status       text NOT NULL DEFAULT 'processing'
               CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  progress     integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  image_url    text,
  thumbnail    text,
  storage_path text,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS provider_request_id text;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS provider_job_id text;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS input_url text;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS thumbnail text;
ALTER TABLE public.image_generations ADD COLUMN IF NOT EXISTS error text;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.image_generations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.image_generations DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.image_generations
  ADD CONSTRAINT image_generations_status_check
  CHECK (status IN ('queued','processing','completed','failed','cancelled'));

DO $$
BEGIN
  ALTER TABLE public.image_generations
    ADD CONSTRAINT image_generations_progress_check CHECK (progress >= 0 AND progress <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.image_generations
    ADD CONSTRAINT image_generations_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES public.image_generations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS image_generations_user_idx
  ON public.image_generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS image_generations_status_idx
  ON public.image_generations(user_id, status, updated_at DESC);

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

-- Additional columns for premium docs experience (idempotent).
ALTER TABLE public.documentation_pages
  ADD COLUMN IF NOT EXISTS is_featured        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homepage_section   text,
  ADD COLUMN IF NOT EXISTS search_keywords    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS author             text,
  ADD COLUMN IF NOT EXISTS related_slugs      text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS view_count         integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS documentation_pages_category_idx
  ON public.documentation_pages(category_id, sort_order);
CREATE INDEX IF NOT EXISTS documentation_pages_status_idx
  ON public.documentation_pages(status);
CREATE INDEX IF NOT EXISTS documentation_pages_parent_idx
  ON public.documentation_pages(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS documentation_pages_homepage_idx
  ON public.documentation_pages(homepage_section) WHERE homepage_section IS NOT NULL;

-- RPC: safely bump view_count for popularity ranking without broad UPDATE grants
CREATE OR REPLACE FUNCTION public.increment_doc_view(_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.documentation_pages
     SET view_count = view_count + 1
   WHERE slug = _slug AND status = 'published' AND visibility = 'public';
$$;
GRANT EXECUTE ON FUNCTION public.increment_doc_view(text) TO anon, authenticated;

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


-- ============================================================================
-- Comprehensive documentation seed (idempotent).
-- Every sidebar / navbar / footer link in /docs resolves to one of these.
-- Admin-edited pages are preserved: ON CONFLICT DO NOTHING.
-- ============================================================================

INSERT INTO public.documentation_categories (slug, title, description, sort_order) VALUES ('getting-started', 'Getting Started', 'Install PrismXGPT, authenticate, and ship your first request.', 0) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_categories (slug, title, description, sort_order) VALUES ('product', 'Product', 'Core features: chat, image generation, projects and more.', 1) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_categories (slug, title, description, sort_order) VALUES ('api-reference', 'API Reference', 'REST endpoints, streaming, errors, rate limits and webhooks.', 2) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_categories (slug, title, description, sort_order) VALUES ('sdks-examples', 'SDKs & Examples', 'Client libraries, working examples, and guided tutorials.', 3) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_categories (slug, title, description, sort_order) VALUES ('administration', 'Administration', 'Manage users, roles, plans, billing and analytics.', 4) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_categories (slug, title, description, sort_order) VALUES ('deployment', 'Deployment', 'Environment setup, storage, production hardening and backups.', 5) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_categories (slug, title, description, sort_order) VALUES ('resources', 'Resources', 'FAQ, troubleshooting, release notes and glossary.', 6) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'installation', 'Installation', 'Add PrismXGPT to a new or existing project.', '# Installation

> Add PrismXGPT to a new or existing project.

## Overview

This page covers **Installation** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Installation is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```bash
npm install @prismxgpt/sdk
# or
pip install prismxgpt
```

## Notes

- Installation respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 1, c.id, now(), ARRAY['setup','cli']::text[], true, true, NULL, ARRAY['quick-start','authentication']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'getting-started' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'quick-start', 'Quick Start', 'Send your first request in under five minutes.', '# Quick Start

> Send your first request in under five minutes.

## Overview

This page covers **Quick Start** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Quick Start is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```ts
import { PrismX } from ''@prismxgpt/sdk'';
const client = new PrismX({ apiKey: process.env.PRISMX_API_KEY! });
const res = await client.chat.create({ model: ''prismx-1'', input: ''Hello!'' });
console.log(res.output_text);
```

## Notes

- Quick Start respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 2, c.id, now(), ARRAY['setup']::text[], true, true, NULL, ARRAY['installation','authentication']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'getting-started' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'authentication', 'Authentication', 'API keys, sessions, and secure server-to-server auth.', '# Authentication

> API keys, sessions, and secure server-to-server auth.

## Overview

This page covers **Authentication** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Authentication is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```bash
curl https://api.prismxgpt.dev/v1/models \
  -H "Authorization: Bearer $PRISMX_API_KEY"
```

## Notes

- Authentication respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 3, c.id, now(), ARRAY['auth','security']::text[], false, false, NULL, ARRAY['quick-start','rest-api']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'getting-started' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'chat', 'Chat', 'Build streaming multi-turn conversations with tools and memory.', '# Chat

> Build streaming multi-turn conversations with tools and memory.

## Overview

This page covers **Chat** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Chat is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```ts
for await (const chunk of client.chat.stream({ model: ''prismx-1'', input: ''Explain SSE'' })) {
  process.stdout.write(chunk.delta ?? '''');
}
```

## Notes

- Chat respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 1, c.id, now(), ARRAY['chat','streaming']::text[], true, false, NULL, ARRAY['streaming','models']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'product' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'image-generation', 'Image Generation', 'Create original images from text prompts.', '# Image Generation

> Create original images from text prompts.

## Overview

This page covers **Image Generation** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Image Generation is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```ts
const img = await client.images.generate({ prompt: ''A prism refracting light'', size: ''1024x1024'' });
console.log(img.url);
```

## Notes

- Image Generation respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 2, c.id, now(), ARRAY['images']::text[], true, false, NULL, ARRAY['image-editing']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'product' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'image-editing', 'Image Editing', 'Iterate on any image with reversible, non-destructive edits.', '# Image Editing

> Iterate on any image with reversible, non-destructive edits.

## Overview

This page covers **Image Editing** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Image Editing is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```ts
const edited = await client.images.edit({ image_id: img.id, prompt: ''make the background midnight blue'' });
```

## Notes

- Image Editing respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 3, c.id, now(), ARRAY['images']::text[], false, false, NULL, ARRAY['image-generation']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'product' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'voice', 'Voice', 'Speech-to-text input and text-to-speech playback.', '# Voice

> Speech-to-text input and text-to-speech playback.

## Overview

This page covers **Voice** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Voice is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```ts
const audio = await client.audio.speech.create({ voice: ''aurora'', input: ''Hello!'' });
```

## Notes

- Voice respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 4, c.id, now(), ARRAY['voice']::text[], false, false, NULL, ARRAY['chat']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'product' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'projects', 'Projects', 'Group chats, files and instructions into shared workspaces.', '# Projects

> Group chats, files and instructions into shared workspaces.

## Overview

This page covers **Projects** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Projects is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Projects respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 5, c.id, now(), ARRAY['projects']::text[], false, true, NULL, ARRAY['library','memory']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'product' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'library', 'Library', 'A searchable archive of every image, upload and document.', '# Library

> A searchable archive of every image, upload and document.

## Overview

This page covers **Library** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Library is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Library respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 6, c.id, now(), ARRAY['library']::text[], false, false, NULL, ARRAY['projects']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'product' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'memory', 'Memory', 'Persistent facts the assistant remembers across sessions.', '# Memory

> Persistent facts the assistant remembers across sessions.

## Overview

This page covers **Memory** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Memory is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Memory respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 7, c.id, now(), ARRAY['memory']::text[], false, false, NULL, ARRAY['chat','projects']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'product' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'models', 'Models', 'Reference: available models, capabilities and pricing.', '# Models

> Reference: available models, capabilities and pricing.

## Overview

This page covers **Models** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Models is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Models respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 8, c.id, now(), ARRAY['models']::text[], false, false, NULL, ARRAY['chat','rate-limits']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'product' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'prompt-library', 'Prompt Library', 'Curated prompts and templates you can reuse.', '# Prompt Library

> Curated prompts and templates you can reuse.

## Overview

This page covers **Prompt Library** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Prompt Library is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Prompt Library respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 9, c.id, now(), ARRAY['prompts']::text[], false, false, NULL, ARRAY['chat']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'product' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'api-overview', 'API Overview', 'How the REST API is organized and versioned.', '# API Overview

> How the REST API is organized and versioned.

## Overview

This page covers **API Overview** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

API Overview is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- API Overview respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 1, c.id, now(), ARRAY['api']::text[], true, true, 'api', ARRAY['rest-api','authentication']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'api-reference' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'rest-api', 'REST API', 'Full reference for every REST endpoint.', '# REST API

> Full reference for every REST endpoint.

## Overview

This page covers **REST API** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

REST API is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```http
POST /v1/chat
Authorization: Bearer $PRISMX_API_KEY
Content-Type: application/json

{ "model": "prismx-1", "input": "Hello!" }
```

## Notes

- REST API respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 2, c.id, now(), ARRAY['api','rest']::text[], false, false, 'api', ARRAY['api-overview','streaming']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'api-reference' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'streaming', 'Streaming', 'Server-sent events for incremental chat responses.', '# Streaming

> Server-sent events for incremental chat responses.

## Overview

This page covers **Streaming** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Streaming is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```ts
const res = await fetch(''/v1/chat/stream'', { method: ''POST'', body: JSON.stringify({ input: ''Hi'' }) });
const reader = res.body!.getReader();
```

## Notes

- Streaming respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 3, c.id, now(), ARRAY['api','streaming']::text[], false, false, 'api', ARRAY['rest-api','chat']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'api-reference' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'errors', 'Errors', 'Standardized error codes and how to handle them.', '# Errors

> Standardized error codes and how to handle them.

## Overview

This page covers **Errors** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Errors is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```json
{ "error": { "code": "rate_limited", "message": "Slow down", "retry_after": 12 } }
```

## Notes

- Errors respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 4, c.id, now(), ARRAY['api','errors']::text[], false, false, 'api', ARRAY['rate-limits','troubleshooting']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'api-reference' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'rate-limits', 'Rate Limits', 'Per-plan quotas, headers and backoff strategy.', '# Rate Limits

> Per-plan quotas, headers and backoff strategy.

## Overview

This page covers **Rate Limits** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Rate Limits is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Remaining: 0
Retry-After: 30
```

## Notes

- Rate Limits respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 5, c.id, now(), ARRAY['api','limits']::text[], false, false, 'api', ARRAY['errors','plans']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'api-reference' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'webhooks', 'Webhooks', 'Receive push notifications for asynchronous events.', '# Webhooks

> Receive push notifications for asynchronous events.

## Overview

This page covers **Webhooks** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Webhooks is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```ts
app.post(''/webhooks/prismx'', (req, res) => {
  const evt = verifySignature(req);
  res.sendStatus(200);
});
```

## Notes

- Webhooks respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 6, c.id, now(), ARRAY['api','webhooks']::text[], false, false, 'api', ARRAY['rest-api']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'api-reference' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'sdks-overview', 'SDKs', 'First-party TypeScript and Python client libraries.', '# SDKs

> First-party TypeScript and Python client libraries.

## Overview

This page covers **SDKs** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

SDKs is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```bash
npm install @prismxgpt/sdk
pip install prismxgpt
```

## Notes

- SDKs respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 1, c.id, now(), ARRAY['sdk']::text[], true, false, 'sdk', ARRAY['quick-start','examples-overview']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'sdks-examples' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'examples-overview', 'Examples', 'Copy-paste ready samples for common workflows.', '# Examples

> Copy-paste ready samples for common workflows.

## Overview

This page covers **Examples** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Examples is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Examples respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 2, c.id, now(), ARRAY['examples']::text[], true, false, 'examples', ARRAY['guides-overview','sdks-overview']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'sdks-examples' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'guides-overview', 'Guides', 'Long-form guides for end-to-end product patterns.', '# Guides

> Long-form guides for end-to-end product patterns.

## Overview

This page covers **Guides** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Guides is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Guides respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 3, c.id, now(), ARRAY['guides']::text[], true, false, 'tutorials', ARRAY['examples-overview','chat']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'sdks-examples' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'administration', 'Administration', 'Admin dashboard overview and daily operations.', '# Administration

> Admin dashboard overview and daily operations.

## Overview

This page covers **Administration** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Administration is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Administration respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 1, c.id, now(), ARRAY['admin']::text[], false, false, NULL, ARRAY['users','plans']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'administration' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'users', 'Users', 'Create, invite, suspend and search users.', '# Users

> Create, invite, suspend and search users.

## Overview

This page covers **Users** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Users is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Users respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 2, c.id, now(), ARRAY['admin','users']::text[], false, false, NULL, ARRAY['roles','administration']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'administration' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'roles', 'Roles', 'Role-based access control and the permissions model.', '# Roles

> Role-based access control and the permissions model.

## Overview

This page covers **Roles** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Roles is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Roles respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 3, c.id, now(), ARRAY['admin','rbac']::text[], false, false, NULL, ARRAY['users','security']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'administration' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'plans', 'Plans', 'Configure pricing plans, limits and entitlements.', '# Plans

> Configure pricing plans, limits and entitlements.

## Overview

This page covers **Plans** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Plans is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Plans respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 4, c.id, now(), ARRAY['admin','plans']::text[], false, false, NULL, ARRAY['billing','rate-limits']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'administration' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'billing', 'Billing', 'Invoices, receipts, tax and refunds.', '# Billing

> Invoices, receipts, tax and refunds.

## Overview

This page covers **Billing** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Billing is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Billing respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 5, c.id, now(), ARRAY['billing']::text[], false, false, NULL, ARRAY['plans']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'administration' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'analytics', 'Analytics', 'Usage, retention and feature-adoption dashboards.', '# Analytics

> Usage, retention and feature-adoption dashboards.

## Overview

This page covers **Analytics** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Analytics is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Analytics respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 6, c.id, now(), ARRAY['analytics']::text[], false, false, NULL, ARRAY['administration']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'administration' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'feature-flags', 'Feature Flags', 'Ship features safely behind toggles and percentage rollouts.', '# Feature Flags

> Ship features safely behind toggles and percentage rollouts.

## Overview

This page covers **Feature Flags** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Feature Flags is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Feature Flags respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 7, c.id, now(), ARRAY['flags']::text[], false, false, NULL, ARRAY['administration']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'administration' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'deployment', 'Deployment', 'Ship PrismXGPT to production on the platform of your choice.', '# Deployment

> Ship PrismXGPT to production on the platform of your choice.

## Overview

This page covers **Deployment** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Deployment is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Deployment respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 1, c.id, now(), ARRAY['deploy']::text[], false, false, NULL, ARRAY['production','environment-variables']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'deployment' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'supabase', 'Supabase', 'Wire the app to a Supabase project (Lovable Cloud).', '# Supabase

> Wire the app to a Supabase project (Lovable Cloud).

## Overview

This page covers **Supabase** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Supabase is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Supabase respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 2, c.id, now(), ARRAY['supabase']::text[], false, false, NULL, ARRAY['environment-variables','storage']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'deployment' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'storage', 'Storage', 'Object storage buckets, policies and signed URLs.', '# Storage

> Object storage buckets, policies and signed URLs.

## Overview

This page covers **Storage** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Storage is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Storage respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 3, c.id, now(), ARRAY['storage']::text[], false, false, NULL, ARRAY['supabase']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'deployment' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'environment-variables', 'Environment Variables', 'All required and optional environment variables, per surface.', '# Environment Variables

> All required and optional environment variables, per surface.

## Overview

This page covers **Environment Variables** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Environment Variables is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Example

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server only
```

## Notes

- Environment Variables respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 4, c.id, now(), ARRAY['env']::text[], false, false, NULL, ARRAY['deployment','production']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'deployment' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'production', 'Production', 'A checklist for hardening before you flip the switch.', '# Production

> A checklist for hardening before you flip the switch.

## Overview

This page covers **Production** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Production is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Production respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 5, c.id, now(), ARRAY['prod']::text[], false, false, NULL, ARRAY['security','backups']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'deployment' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'security', 'Security', 'Threat model, defaults and recommended hardening.', '# Security

> Threat model, defaults and recommended hardening.

## Overview

This page covers **Security** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Security is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Security respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 6, c.id, now(), ARRAY['security']::text[], false, false, NULL, ARRAY['roles','backups']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'deployment' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'backups', 'Backups', 'Point-in-time recovery, exports and disaster planning.', '# Backups

> Point-in-time recovery, exports and disaster planning.

## Overview

This page covers **Backups** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Backups is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Backups respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 7, c.id, now(), ARRAY['backups']::text[], false, false, NULL, ARRAY['production','security']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'deployment' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'faq', 'FAQ', 'Answers to the most common questions.', '# FAQ

> Answers to the most common questions.

## Overview

This page covers **FAQ** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

FAQ is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- FAQ respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 1, c.id, now(), ARRAY['faq']::text[], false, false, 'community', ARRAY['troubleshooting']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'resources' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'troubleshooting', 'Troubleshooting', 'Diagnose common issues and their fixes.', '# Troubleshooting

> Diagnose common issues and their fixes.

## Overview

This page covers **Troubleshooting** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Troubleshooting is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Troubleshooting respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 2, c.id, now(), ARRAY['support']::text[], false, false, 'community', ARRAY['errors','faq']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'resources' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'release-notes', 'Release Notes', 'Detailed changelog of every release.', '# Release Notes

> Detailed changelog of every release.

## Overview

This page covers **Release Notes** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Release Notes is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Release Notes respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 3, c.id, now(), ARRAY['releases']::text[], false, false, 'changelog', ARRAY['changelog']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'resources' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'changelog', 'Changelog', 'What''s new, what changed, what''s coming next.', '# Changelog

> What''s new, what changed, what''s coming next.

## Overview

This page covers **Changelog** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Changelog is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Changelog respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 4, c.id, now(), ARRAY['releases']::text[], true, false, 'changelog', ARRAY['release-notes']::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'resources' ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.documentation_pages (slug, title, description, content, status, visibility, sort_order, category_id, published_at, tags, is_featured, is_pinned, homepage_section, related_slugs, author, reading_minutes) SELECT 'glossary', 'Glossary', 'Terminology used throughout the platform.', '# Glossary

> Terminology used throughout the platform.

## Overview

This page covers **Glossary** in PrismXGPT. Use it as a reference while you build, and follow the linked related pages for deeper dives.

## How it works

Glossary is designed around three principles: predictability, safety and speed. Every request is idempotent by default, every response is versioned, and every mutation is auditable from the admin dashboard.

## Notes

- Glossary respects your project''s active plan limits.
- All timestamps are ISO 8601 UTC.
- Field names are `snake_case` in JSON and `camelCase` in the SDKs.

## Best practices

1. Always handle transient errors with exponential backoff.
2. Store secrets in server-side environment variables — never in the client bundle.
3. Prefer streaming for anything user-facing to reduce time-to-first-token.

## Related

See the sidebar for related pages, or press `⌘K` / `Ctrl+K` to jump anywhere.
', 'published', 'public', 5, c.id, now(), ARRAY['glossary']::text[], false, false, NULL, ARRAY[]::text[], 'PrismXGPT Team', 1 FROM public.documentation_categories c WHERE c.slug = 'resources' ON CONFLICT (slug) DO NOTHING;



-- =============================================================================
-- Developer Platform: REMOVED (2026-07-26)
-- Drops every object created by the former developer platform. Idempotent.
-- =============================================================================
DROP FUNCTION IF EXISTS public.user_can_use_model(uuid, text)  CASCADE;
DROP FUNCTION IF EXISTS public.user_model_access(uuid)         CASCADE;
DROP FUNCTION IF EXISTS public.api_key_usage_stats(uuid, int)  CASCADE;

DROP TABLE IF EXISTS public.webhook_deliveries    CASCADE;
DROP TABLE IF EXISTS public.webhooks              CASCADE;
DROP TABLE IF EXISTS public.api_key_ip_history    CASCADE;
DROP TABLE IF EXISTS public.api_key_usage         CASCADE;
DROP TABLE IF EXISTS public.api_keys              CASCADE;
DROP TABLE IF EXISTS public.model_plan_access     CASCADE;
DROP TABLE IF EXISTS public.model_catalog         CASCADE;
DROP TABLE IF EXISTS public.model_providers       CASCADE;

DROP TYPE  IF EXISTS public.api_key_status        CASCADE;
DROP TYPE  IF EXISTS public.model_status          CASCADE;
