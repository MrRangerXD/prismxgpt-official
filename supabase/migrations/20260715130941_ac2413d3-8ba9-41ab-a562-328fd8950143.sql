CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DO $$ BEGIN CREATE TYPE public.plan_tier AS ENUM ('free','premium'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','premium','user','pro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT, display_name TEXT, username TEXT, avatar_url TEXT,
  plan public.plan_tier NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz, UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL, name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.project_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL, title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.project_chats(id) ON DELETE CASCADE,
  role text NOT NULL, content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_share_links (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_settings (
  id text PRIMARY KEY, name text NOT NULL, price text NOT NULL,
  strike_price text, note text, cta_label text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY, value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL, target_id uuid, action text NOT NULL,
  metadata jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, kind text NOT NULL, title text, prompt text,
  storage_path text NOT NULL, mime_type text, size_bytes bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  invite_token TEXT UNIQUE, invite_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_chat_members (
  chat_id UUID NOT NULL REFERENCES public.shared_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.shared_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.shared_chats(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.public_chat_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL, title text NOT NULL DEFAULT 'Shared chat',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_chat_state (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  threads JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.image_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS conversations_user_updated_idx ON public.conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS shared_chat_messages_chat_created_idx ON public.shared_chat_messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS shared_chats_owner_idx ON public.shared_chats(owner_id);
CREATE INDEX IF NOT EXISTS shared_chat_members_user_chat_idx ON public.shared_chat_members(user_id, chat_id);
CREATE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON public.profiles (lower(email));
CREATE INDEX IF NOT EXISTS profiles_display_name_lower_idx ON public.profiles (lower(display_name));

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role AND (expires_at IS NULL OR expires_at>now()));
$$;
CREATE OR REPLACE FUNCTION private.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.projects WHERE id=_project_id AND owner_id=_user_id);
$$;
CREATE OR REPLACE FUNCTION private.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.projects WHERE id=_project_id AND owner_id=_user_id)
      OR EXISTS(SELECT 1 FROM public.project_members WHERE project_id=_project_id AND user_id=_user_id);
$$;
CREATE OR REPLACE FUNCTION private.chat_project_id(_chat_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT project_id FROM public.project_chats WHERE id=_chat_id;
$$;
CREATE OR REPLACE FUNCTION private.is_shared_chat_participant(_chat_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.shared_chats WHERE id=_chat_id AND owner_id=_user_id)
      OR EXISTS(SELECT 1 FROM public.shared_chat_members WHERE chat_id=_chat_id AND user_id=_user_id);
$$;
CREATE OR REPLACE FUNCTION private.prevent_profile_plan_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan AND NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    NEW.plan := OLD.plan;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.consume_image_quota(_limit integer, _user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := _user_id; today date := (now() AT TIME ZONE 'utc')::date; current_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'user id required'; END IF;
  INSERT INTO public.image_usage (user_id, day, count) VALUES (uid, today, 0) ON CONFLICT (user_id, day) DO NOTHING;
  SELECT count INTO current_count FROM public.image_usage WHERE user_id=uid AND day=today FOR UPDATE;
  IF current_count >= _limit THEN RETURN -1; END IF;
  UPDATE public.image_usage SET count=count+1, updated_at=now() WHERE user_id=uid AND day=today;
  RETURN _limit - (current_count + 1);
END; $$;

DROP FUNCTION IF EXISTS public.search_invitable_users(text);
CREATE FUNCTION public.search_invitable_users(_query text)
RETURNS TABLE(id uuid, display_name text, username text, avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _clean text := replace(replace(coalesce(_query, ''), '%', ''), '_', '');
BEGIN
  IF auth.uid() IS NULL OR length(_clean) < 3 THEN RETURN; END IF;
  RETURN QUERY EXECUTE
    'SELECT p.id, p.display_name, p.username, p.avatar_url FROM public.profiles p
     WHERE p.id <> $1 AND (p.username ILIKE $2 OR p.display_name ILIKE $2) LIMIT 20'
    USING auth.uid(), '%' || _clean || '%';
END; $$;

CREATE OR REPLACE FUNCTION public.get_shared_chat_members(_chat_id uuid)
RETURNS TABLE(user_id uuid, role text, joined_at timestamptz, display_name text, username text, avatar_url text, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, m.role, m.joined_at, p.display_name, p.username, p.avatar_url, NULL::text AS email
  FROM public.shared_chat_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.chat_id = _chat_id AND private.is_shared_chat_participant(_chat_id, auth.uid());
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS profiles_prevent_plan_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_plan_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.prevent_profile_plan_escalation();
DROP TRIGGER IF EXISTS conversations_updated_at ON public.conversations;
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS shared_chats_set_updated_at ON public.shared_chats;
CREATE TRIGGER shared_chats_set_updated_at BEFORE UPDATE ON public.shared_chats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_share_links_set_updated_at ON public.project_share_links;
CREATE TRIGGER project_share_links_set_updated_at BEFORE UPDATE ON public.project_share_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS user_chat_state_updated_at ON public.user_chat_state;
CREATE TRIGGER user_chat_state_updated_at BEFORE UPDATE ON public.user_chat_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_share_links TO authenticated;
GRANT SELECT ON public.plan_settings TO authenticated;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT SELECT ON public.activity_log TO authenticated;
GRANT INSERT (actor_id, target_id, action, metadata) ON public.activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chat_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_chat_state TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.public_chat_snapshots TO authenticated;
GRANT SELECT ON public.image_usage TO authenticated;
GRANT SELECT ON public.plan_settings TO anon;
GRANT SELECT ON public.app_settings TO anon;
GRANT ALL ON public.profiles, public.user_roles, public.conversations, public.messages,
             public.projects, public.project_members, public.project_chats, public.project_messages,
             public.project_share_links, public.plan_settings, public.app_settings,
             public.activity_log, public.library_items, public.shared_chats,
             public.shared_chat_members, public.shared_chat_messages, public.user_chat_state,
             public.public_chat_snapshots, public.image_usage TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_project_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_project_owner(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_project_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_project_member(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.chat_project_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.chat_project_id(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_shared_chat_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_shared_chat_participant(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.consume_image_quota(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_image_quota(integer, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.search_invitable_users(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_invitable_users(text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_shared_chat_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_chat_members(uuid) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_chat_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_chat_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid()=id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid()=id) WITH CHECK (auth.uid()=id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid()=id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid()=user_id OR private.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "Users manage own conversations" ON public.conversations;
CREATE POLICY "Users manage own conversations" ON public.conversations FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
DROP POLICY IF EXISTS "Users manage own messages" ON public.messages;
CREATE POLICY "Users manage own messages" ON public.messages FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

DROP POLICY IF EXISTS "Members view projects" ON public.projects;
DROP POLICY IF EXISTS "Owners manage projects" ON public.projects;
CREATE POLICY "Members view projects" ON public.projects FOR SELECT TO authenticated USING (private.is_project_member(id, auth.uid()));
CREATE POLICY "Owners manage projects" ON public.projects FOR ALL TO authenticated USING (owner_id=auth.uid()) WITH CHECK (owner_id=auth.uid());

DROP POLICY IF EXISTS "Members view membership" ON public.project_members;
DROP POLICY IF EXISTS "Owners manage membership" ON public.project_members;
CREATE POLICY "Members view membership" ON public.project_members FOR SELECT TO authenticated USING (private.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners manage membership" ON public.project_members FOR ALL TO authenticated USING (private.is_project_owner(project_id, auth.uid())) WITH CHECK (private.is_project_owner(project_id, auth.uid()));

DROP POLICY IF EXISTS "Members view chats" ON public.project_chats;
DROP POLICY IF EXISTS "Members manage chats" ON public.project_chats;
CREATE POLICY "Members view chats" ON public.project_chats FOR SELECT TO authenticated USING (private.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members manage chats" ON public.project_chats FOR ALL TO authenticated USING (private.is_project_member(project_id, auth.uid())) WITH CHECK (private.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Members view messages" ON public.project_messages;
DROP POLICY IF EXISTS "Members insert messages" ON public.project_messages;
DROP POLICY IF EXISTS "Owners update messages" ON public.project_messages;
DROP POLICY IF EXISTS "Owners delete messages" ON public.project_messages;
CREATE POLICY "Members view messages" ON public.project_messages FOR SELECT TO authenticated USING (private.is_project_member(private.chat_project_id(chat_id), auth.uid()));
CREATE POLICY "Members insert messages" ON public.project_messages FOR INSERT TO authenticated WITH CHECK (private.is_project_member(private.chat_project_id(chat_id), auth.uid()));
CREATE POLICY "Owners update messages" ON public.project_messages FOR UPDATE TO authenticated USING (private.is_project_owner(private.chat_project_id(chat_id), auth.uid())) WITH CHECK (private.is_project_owner(private.chat_project_id(chat_id), auth.uid()));
CREATE POLICY "Owners delete messages" ON public.project_messages FOR DELETE TO authenticated USING (private.is_project_owner(private.chat_project_id(chat_id), auth.uid()));

DROP POLICY IF EXISTS "Owner reads share link" ON public.project_share_links;
DROP POLICY IF EXISTS "Owner inserts share link" ON public.project_share_links;
DROP POLICY IF EXISTS "Owner updates share link" ON public.project_share_links;
DROP POLICY IF EXISTS "Owner deletes share link" ON public.project_share_links;
CREATE POLICY "Owner reads share link" ON project_share_links FOR SELECT TO authenticated USING (private.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owner inserts share link" ON project_share_links FOR INSERT TO authenticated WITH CHECK (private.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owner updates share link" ON project_share_links FOR UPDATE TO authenticated USING (private.is_project_owner(project_id, auth.uid())) WITH CHECK (private.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owner deletes share link" ON project_share_links FOR DELETE TO authenticated USING (private.is_project_owner(project_id, auth.uid()));

DROP POLICY IF EXISTS "Public pricing plans readable" ON public.plan_settings;
DROP POLICY IF EXISTS "Admins manage plans" ON public.plan_settings;
CREATE POLICY "Public pricing plans readable" ON public.plan_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage plans" ON public.plan_settings FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "Public announcement settings readable" ON public.app_settings;
DROP POLICY IF EXISTS "Admins manage settings" ON public.app_settings;
CREATE POLICY "Public announcement settings readable" ON public.app_settings FOR SELECT TO anon, authenticated USING (key IN ('homepage_announcement','chat_announcement'));
CREATE POLICY "Admins manage settings" ON public.app_settings FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins insert audit actions" ON public.activity_log;
DROP POLICY IF EXISTS "Users or admins view logs" ON public.activity_log;
CREATE POLICY "Admins insert audit actions" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (actor_id=auth.uid() AND private.has_role(auth.uid(),'admin'::public.app_role) AND action IN ('role.grant','role.revoke','settings.update','plan.update','user.signup'));
CREATE POLICY "Users or admins view logs" ON public.activity_log FOR SELECT TO authenticated USING (actor_id=auth.uid() OR private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "Users manage own library" ON public.library_items;
CREATE POLICY "Users manage own library" ON public.library_items FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

DROP POLICY IF EXISTS "Owner can create shared chat" ON public.shared_chats;
DROP POLICY IF EXISTS "Owner can update shared chat" ON public.shared_chats;
DROP POLICY IF EXISTS "Owner can delete shared chat" ON public.shared_chats;
DROP POLICY IF EXISTS "Participants can view shared chat" ON public.shared_chats;
CREATE POLICY "Owner can create shared chat" ON public.shared_chats FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND owner_id=auth.uid());
CREATE POLICY "Owner can update shared chat" ON public.shared_chats FOR UPDATE TO authenticated USING (owner_id=auth.uid()) WITH CHECK (owner_id=auth.uid());
CREATE POLICY "Owner can delete shared chat" ON public.shared_chats FOR DELETE TO authenticated USING (owner_id=auth.uid());
CREATE POLICY "Participants can view shared chat" ON public.shared_chats FOR SELECT TO authenticated USING (private.is_shared_chat_participant(id, auth.uid()));

DROP POLICY IF EXISTS "Participants can view members" ON public.shared_chat_members;
DROP POLICY IF EXISTS "Owner can invite members" ON public.shared_chat_members;
DROP POLICY IF EXISTS "Owner removes members; user removes self" ON public.shared_chat_members;
CREATE POLICY "Participants can view members" ON public.shared_chat_members FOR SELECT TO authenticated USING (private.is_shared_chat_participant(chat_id, auth.uid()));
CREATE POLICY "Owner can invite members" ON public.shared_chat_members FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.shared_chats c WHERE c.id=shared_chat_members.chat_id AND c.owner_id=auth.uid()));
CREATE POLICY "Owner removes members; user removes self" ON public.shared_chat_members FOR DELETE TO authenticated USING (user_id=auth.uid() OR EXISTS (SELECT 1 FROM public.shared_chats c WHERE c.id=chat_id AND c.owner_id=auth.uid()));

DROP POLICY IF EXISTS "Participants can view messages" ON public.shared_chat_messages;
DROP POLICY IF EXISTS "Participants can insert messages" ON public.shared_chat_messages;
DROP POLICY IF EXISTS "Participants can update own streaming messages" ON public.shared_chat_messages;
DROP POLICY IF EXISTS "Owner deletes any message" ON public.shared_chat_messages;
CREATE POLICY "Participants can view messages" ON public.shared_chat_messages FOR SELECT TO authenticated USING (private.is_shared_chat_participant(chat_id, auth.uid()));
CREATE POLICY "Participants can insert messages" ON public.shared_chat_messages FOR INSERT TO authenticated WITH CHECK (private.is_shared_chat_participant(chat_id, auth.uid()) AND (author_id=auth.uid() OR author_id IS NULL));
CREATE POLICY "Participants can update own streaming messages" ON public.shared_chat_messages FOR UPDATE TO authenticated USING (private.is_shared_chat_participant(chat_id, auth.uid()) AND author_id=auth.uid()) WITH CHECK (private.is_shared_chat_participant(chat_id, auth.uid()) AND author_id=auth.uid());
CREATE POLICY "Owner deletes any message" ON public.shared_chat_messages FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.shared_chats c WHERE c.id=chat_id AND c.owner_id=auth.uid()));

DROP POLICY IF EXISTS "Owners can view their snapshots" ON public.public_chat_snapshots;
DROP POLICY IF EXISTS "Users can create own snapshots" ON public.public_chat_snapshots;
DROP POLICY IF EXISTS "Owners can delete their snapshots" ON public.public_chat_snapshots;
DROP POLICY IF EXISTS "Owners update own snapshots" ON public.public_chat_snapshots;
CREATE POLICY "Owners can view their snapshots" ON public.public_chat_snapshots FOR SELECT TO authenticated USING (owner_id=auth.uid());
CREATE POLICY "Users can create own snapshots" ON public.public_chat_snapshots FOR INSERT TO authenticated WITH CHECK (owner_id=auth.uid());
CREATE POLICY "Owners update own snapshots" ON public.public_chat_snapshots FOR UPDATE TO authenticated USING (auth.uid()=owner_id) WITH CHECK (auth.uid()=owner_id);
CREATE POLICY "Owners can delete their snapshots" ON public.public_chat_snapshots FOR DELETE TO authenticated USING (owner_id=auth.uid());

DROP POLICY IF EXISTS "Users manage own chat state select" ON public.user_chat_state;
DROP POLICY IF EXISTS "Users manage own chat state insert" ON public.user_chat_state;
DROP POLICY IF EXISTS "Users manage own chat state update" ON public.user_chat_state;
DROP POLICY IF EXISTS "Users manage own chat state delete" ON public.user_chat_state;
CREATE POLICY "Users manage own chat state select" ON public.user_chat_state FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users manage own chat state insert" ON public.user_chat_state FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users manage own chat state update" ON public.user_chat_state FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users manage own chat state delete" ON public.user_chat_state FOR DELETE TO authenticated USING (auth.uid()=user_id);

DROP POLICY IF EXISTS "Users read own image usage" ON public.image_usage;
CREATE POLICY "Users read own image usage" ON public.image_usage FOR SELECT TO authenticated USING (user_id=auth.uid());

DROP POLICY IF EXISTS "library owner read" ON storage.objects;
DROP POLICY IF EXISTS "library owner insert" ON storage.objects;
DROP POLICY IF EXISTS "library owner update" ON storage.objects;
DROP POLICY IF EXISTS "library owner delete" ON storage.objects;
CREATE POLICY "library owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='library' AND (storage.foldername(name))[1]=auth.uid()::text
    AND EXISTS (SELECT 1 FROM public.library_items li WHERE li.storage_path=storage.objects.name AND li.user_id=auth.uid()));
CREATE POLICY "library owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='library' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "library owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='library' AND (storage.foldername(name))[1]=auth.uid()::text
    AND EXISTS (SELECT 1 FROM public.library_items li WHERE li.storage_path=storage.objects.name AND li.user_id=auth.uid()))
  WITH CHECK (bucket_id='library' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "library owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='library' AND (storage.foldername(name))[1]=auth.uid()::text
    AND EXISTS (SELECT 1 FROM public.library_items li WHERE li.storage_path=storage.objects.name AND li.user_id=auth.uid()));

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_chat_messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_chat_members; EXCEPTION WHEN duplicate_object THEN NULL; END $$;