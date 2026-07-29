-- Idempotent admin bootstrap for zensei@zenseihub.in
-- Run in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  target_email text := 'zensei@zenseihub.in';
  -- No password is stored in source control. A random one-time password is
  -- generated here; the admin must reset it via the "Forgot password" flow.
  target_password text := encode(gen_random_bytes(24), 'base64');
  target_id uuid;
BEGIN
  -- Ensure required enum exists (safe no-op if already there)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin','premium','user','pro');
  END IF;

  -- Ensure user_roles table exists (safe no-op if already there)
  CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.app_role NOT NULL,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
  );

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
      '{"full_name":"Zensei Admin","username":"zensei"}'::jsonb,
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
  ELSE
    -- Never overwrite an existing password from a script in source control.
    UPDATE auth.users
      SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now(),
          raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
            || '{"provider":"email","providers":["email"]}'::jsonb
      WHERE id = target_id;

    -- Ensure an email identity exists
    IF NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = target_id AND provider = 'email'
    ) THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), target_id,
        jsonb_build_object('sub', target_id::text, 'email', target_email, 'email_verified', true),
        'email', target_id::text, now(), now(), now()
      );
    END IF;
  END IF;

  -- Upsert profile if profiles table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='profiles') THEN
    EXECUTE format(
      'INSERT INTO public.profiles (id, email, display_name)
         VALUES (%L, %L, %L)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email',
      target_id, target_email, 'Zensei Admin'
    );
  END IF;

  -- Grant admin role (never expires); remove any expiry if row already exists
  INSERT INTO public.user_roles (user_id, role, expires_at)
    VALUES (target_id, 'admin'::public.app_role, NULL)
  ON CONFLICT (user_id, role) DO UPDATE SET expires_at = NULL;
END $$;
