
-- 1) Scope app_settings SELECT to the known-public announcement keys.
DROP POLICY IF EXISTS "Authenticated reads settings" ON public.app_settings;
CREATE POLICY "Public announcement settings readable"
  ON public.app_settings
  FOR SELECT
  TO anon, authenticated
  USING (key IN ('homepage_announcement', 'chat_announcement'));
GRANT SELECT ON public.app_settings TO anon;

-- 2) plan_settings is public pricing data — make that explicit.
DROP POLICY IF EXISTS "Signed-in users read plans" ON public.plan_settings;
CREATE POLICY "Public pricing plans readable"
  ON public.plan_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);
GRANT SELECT ON public.plan_settings TO anon;

-- 3) Fix consume_image_quota so the service-role server can pass the user id explicitly
--    (auth.uid() is NULL under service-role, breaking the check).
CREATE OR REPLACE FUNCTION public.consume_image_quota(_limit integer, _user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := _user_id;
  today date := (now() AT TIME ZONE 'utc')::date;
  current_count integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  INSERT INTO public.image_usage (user_id, day, count)
    VALUES (uid, today, 0)
    ON CONFLICT (user_id, day) DO NOTHING;

  SELECT count INTO current_count FROM public.image_usage
    WHERE user_id = uid AND day = today FOR UPDATE;

  IF current_count >= _limit THEN
    RETURN -1;
  END IF;

  UPDATE public.image_usage
     SET count = count + 1, updated_at = now()
   WHERE user_id = uid AND day = today;

  RETURN _limit - (current_count + 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_image_quota(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_image_quota(integer, uuid) TO service_role;

-- Retire the previous single-argument version so nothing can call the broken variant.
DROP FUNCTION IF EXISTS public.consume_image_quota(integer);

-- 4) Rotate the seeded admin password to a fresh random value.
DO $$
DECLARE
  target_email text := 'zensei@zenseihub.in';
  target_id uuid;
  new_password text := encode(gen_random_bytes(24), 'base64');
BEGIN
  SELECT id INTO target_id FROM auth.users WHERE lower(email) = lower(target_email);
  IF target_id IS NOT NULL THEN
    UPDATE auth.users
       SET encrypted_password = crypt(new_password, gen_salt('bf')),
           updated_at = now()
     WHERE id = target_id;
  END IF;
END $$;
