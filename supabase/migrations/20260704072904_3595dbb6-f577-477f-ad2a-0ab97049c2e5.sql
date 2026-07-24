
-- 1) shared_chat_join_bypass: replace permissive INSERT policy so only owners can self-insert via RLS;
--    non-owner joins must go through joinByToken() server fn which uses the service role.
DROP POLICY IF EXISTS "User can join via valid invite" ON public.shared_chat_members;
CREATE POLICY "Owner can add self as member"
  ON public.shared_chat_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.shared_chats c
      WHERE c.id = chat_id AND c.owner_id = auth.uid()
    )
  );

-- 2) library_bucket_no_rls: per-user folder policies on storage.objects for the private 'library' bucket.
DROP POLICY IF EXISTS "library owner read" ON storage.objects;
DROP POLICY IF EXISTS "library owner insert" ON storage.objects;
DROP POLICY IF EXISTS "library owner update" ON storage.objects;
DROP POLICY IF EXISTS "library owner delete" ON storage.objects;

CREATE POLICY "library owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'library' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "library owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'library' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "library owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'library' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'library' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "library owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'library' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3) image_quota_client_only: server-side per-user daily image counter.
CREATE TABLE IF NOT EXISTS public.image_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

GRANT SELECT ON public.image_usage TO authenticated;
GRANT ALL ON public.image_usage TO service_role;

ALTER TABLE public.image_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own image usage" ON public.image_usage;
CREATE POLICY "Users read own image usage"
  ON public.image_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Atomically check + increment daily quota. Returns remaining allowance (>=0) on success,
-- or -1 when the daily limit is exceeded. Admins/premium bypass in application code.
CREATE OR REPLACE FUNCTION public.consume_image_quota(_limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'utc')::date;
  current_count integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
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
$$;

REVOKE ALL ON FUNCTION public.consume_image_quota(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_image_quota(integer) TO authenticated;
