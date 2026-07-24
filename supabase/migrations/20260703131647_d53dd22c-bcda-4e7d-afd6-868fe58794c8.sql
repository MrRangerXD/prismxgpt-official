
-- Plan enum
CREATE TYPE public.plan_tier AS ENUM ('free', 'premium');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  plan public.plan_tier NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own conversations" ON public.conversations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX conversations_user_updated_idx ON public.conversations(user_id, updated_at DESC);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own messages" ON public.messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX messages_conv_idx ON public.messages(conversation_id, created_at ASC);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin','premium','user','pro');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles
    WHERE user_id=_user_id AND role=_role
      AND (expires_at IS NULL OR expires_at > now()));
$$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- Projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.projects WHERE id=_project_id AND owner_id=_user_id);
$$;
CREATE OR REPLACE FUNCTION private.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.projects WHERE id=_project_id AND owner_id=_user_id)
     OR EXISTS(SELECT 1 FROM public.project_members WHERE project_id=_project_id AND user_id=_user_id);
$$;
REVOKE ALL ON FUNCTION private.is_project_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_project_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_project_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_project_member(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "Members view projects" ON public.projects FOR SELECT TO authenticated
  USING (private.is_project_member(id, auth.uid()));
CREATE POLICY "Owners manage projects" ON public.projects FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Members view membership" ON public.project_members FOR SELECT TO authenticated
  USING (private.is_project_member(project_id, auth.uid()));
CREATE POLICY "Owners manage membership" ON public.project_members FOR ALL TO authenticated
  USING (private.is_project_owner(project_id, auth.uid()))
  WITH CHECK (private.is_project_owner(project_id, auth.uid()));

-- Project chats + messages
CREATE TABLE public.project_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chats TO authenticated;
GRANT ALL ON public.project_chats TO service_role;
ALTER TABLE public.project_chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.project_chats(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_messages TO authenticated;
GRANT ALL ON public.project_messages TO service_role;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.chat_project_id(_chat_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT project_id FROM public.project_chats WHERE id=_chat_id;
$$;
REVOKE ALL ON FUNCTION private.chat_project_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.chat_project_id(uuid) TO authenticated, service_role;

CREATE POLICY "Members view chats" ON public.project_chats FOR SELECT TO authenticated
  USING (private.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members manage chats" ON public.project_chats FOR ALL TO authenticated
  USING (private.is_project_member(project_id, auth.uid()))
  WITH CHECK (private.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members view messages" ON public.project_messages FOR SELECT TO authenticated
  USING (private.is_project_member(private.chat_project_id(chat_id), auth.uid()));
CREATE POLICY "Members insert messages" ON public.project_messages FOR INSERT TO authenticated
  WITH CHECK (private.is_project_member(private.chat_project_id(chat_id), auth.uid()));
CREATE POLICY "Owners update messages" ON public.project_messages FOR UPDATE TO authenticated
  USING (private.is_project_owner(private.chat_project_id(chat_id), auth.uid()))
  WITH CHECK (private.is_project_owner(private.chat_project_id(chat_id), auth.uid()));
CREATE POLICY "Owners delete messages" ON public.project_messages FOR DELETE TO authenticated
  USING (private.is_project_owner(private.chat_project_id(chat_id), auth.uid()));

-- Plan settings
CREATE TABLE public.plan_settings (
  id text PRIMARY KEY,
  name text NOT NULL,
  price text NOT NULL,
  strike_price text,
  note text,
  cta_label text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_settings TO authenticated;
GRANT ALL ON public.plan_settings TO service_role;
ALTER TABLE public.plan_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read plans" ON public.plan_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage plans" ON public.plan_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- App settings
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated reads settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage settings" ON public.app_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- Activity log
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  target_id uuid,
  action text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own actions" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
CREATE POLICY "Users or admins view logs" ON public.activity_log FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- Library items
CREATE TABLE public.library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text,
  prompt text,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_items TO authenticated;
GRANT ALL ON public.library_items TO service_role;
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own library" ON public.library_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Shared chats
CREATE TABLE public.shared_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  invite_token TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chats TO authenticated;
GRANT ALL ON public.shared_chats TO service_role;
ALTER TABLE public.shared_chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shared_chat_members (
  chat_id UUID NOT NULL REFERENCES public.shared_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chat_members TO authenticated;
GRANT ALL ON public.shared_chat_members TO service_role;
ALTER TABLE public.shared_chat_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shared_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.shared_chats(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX shared_chat_messages_chat_created_idx ON public.shared_chat_messages(chat_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chat_messages TO authenticated;
GRANT ALL ON public.shared_chat_messages TO service_role;
ALTER TABLE public.shared_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.is_shared_chat_participant(_chat_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.shared_chats WHERE id = _chat_id AND owner_id = _user_id)
      OR EXISTS(SELECT 1 FROM public.shared_chat_members WHERE chat_id = _chat_id AND user_id = _user_id);
$$;
REVOKE ALL ON FUNCTION private.is_shared_chat_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_shared_chat_participant(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "Owner can create shared chat" ON public.shared_chats FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());
CREATE POLICY "Owner can update shared chat" ON public.shared_chats FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can delete shared chat" ON public.shared_chats FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY "Participants can view shared chat" ON public.shared_chats FOR SELECT TO authenticated
  USING (private.is_shared_chat_participant(id, auth.uid()));

CREATE POLICY "Participants can view members" ON public.shared_chat_members FOR SELECT TO authenticated
  USING (private.is_shared_chat_participant(chat_id, auth.uid()));
CREATE POLICY "User can join via valid invite" ON public.shared_chat_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.shared_chats c
      WHERE c.id = shared_chat_members.chat_id
        AND (c.owner_id = auth.uid()
             OR (c.invite_token IS NOT NULL AND (c.invite_expires_at IS NULL OR c.invite_expires_at > now())))
    )
  );
CREATE POLICY "Owner removes members; user removes self" ON public.shared_chat_members FOR DELETE TO authenticated
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.shared_chats c WHERE c.id = chat_id AND c.owner_id = auth.uid()));

CREATE POLICY "Participants can view messages" ON public.shared_chat_messages FOR SELECT TO authenticated
  USING (private.is_shared_chat_participant(chat_id, auth.uid()));
CREATE POLICY "Participants can insert messages" ON public.shared_chat_messages FOR INSERT TO authenticated
  WITH CHECK (private.is_shared_chat_participant(chat_id, auth.uid()) AND (author_id = auth.uid() OR author_id IS NULL));
CREATE POLICY "Participants can update own streaming messages" ON public.shared_chat_messages FOR UPDATE TO authenticated
  USING (private.is_shared_chat_participant(chat_id, auth.uid()) AND author_id = auth.uid())
  WITH CHECK (private.is_shared_chat_participant(chat_id, auth.uid()) AND author_id = auth.uid());
CREATE POLICY "Owner deletes any message" ON public.shared_chat_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shared_chats c WHERE c.id = chat_id AND c.owner_id = auth.uid()));

CREATE TRIGGER shared_chats_set_updated_at BEFORE UPDATE ON public.shared_chats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_chat_members;

-- Public read-only snapshots
CREATE TABLE public.public_chat_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Shared chat',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.public_chat_snapshots TO anon, authenticated;
GRANT INSERT, DELETE ON public.public_chat_snapshots TO authenticated;
GRANT ALL ON public.public_chat_snapshots TO service_role;
ALTER TABLE public.public_chat_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view a snapshot by id" ON public.public_chat_snapshots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users can create own snapshots" ON public.public_chat_snapshots FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can delete their snapshots" ON public.public_chat_snapshots FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Project share links
CREATE TABLE public.project_share_links (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_share_links TO authenticated;
GRANT ALL ON public.project_share_links TO service_role;
ALTER TABLE public.project_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads share link" ON public.project_share_links FOR SELECT TO authenticated
  USING (private.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owner inserts share link" ON public.project_share_links FOR INSERT TO authenticated
  WITH CHECK (private.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owner updates share link" ON public.project_share_links FOR UPDATE TO authenticated
  USING (private.is_project_owner(project_id, auth.uid()))
  WITH CHECK (private.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Owner deletes share link" ON public.project_share_links FOR DELETE TO authenticated
  USING (private.is_project_owner(project_id, auth.uid()));
CREATE TRIGGER project_share_links_set_updated_at BEFORE UPDATE ON public.project_share_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can view all user_roles" ON public.user_roles FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- Seed the PrismXGPT admin account
DO $$
DECLARE
  target_email text := 'REDACTED_ADMIN_EMAIL_PLACEHOLDER@example.invalid';
  target_password text := encode(gen_random_bytes(24), 'base64'); -- redacted; rotated by later migration
  target_id uuid;
BEGIN
  SELECT id INTO target_id FROM auth.users WHERE lower(email) = lower(target_email);
  IF target_id IS NULL THEN
    target_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      target_id, 'authenticated', 'authenticated',
      target_email, crypt(target_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"PrismXGPT Admin","username":"admin"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), target_id,
      jsonb_build_object('sub', target_id::text, 'email', target_email, 'email_verified', true),
      'email', target_id::text, now(), now(), now()
    );
  END IF;

  INSERT INTO public.profiles (id, email, display_name, plan)
    VALUES (target_id, target_email, 'PrismXGPT Admin', 'free')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (target_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
