
-- 1) search_invitable_users: remove email from results to prevent PII enumeration
DROP FUNCTION IF EXISTS public.search_invitable_users(text);
CREATE FUNCTION public.search_invitable_users(_query text)
RETURNS TABLE(id uuid, display_name text, username text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, p.username, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND length(coalesce(_query,'')) >= 3
    AND (
      p.username ILIKE '%' || _query || '%'
      OR p.display_name ILIKE '%' || _query || '%'
      OR p.email ILIKE _query
    )
  LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.search_invitable_users(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_invitable_users(text) TO authenticated;

-- 2) Lock down SECURITY DEFINER functions: revoke default PUBLIC EXECUTE
REVOKE ALL ON FUNCTION public.consume_image_quota(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_image_quota(integer, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_shared_chat_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_chat_members(uuid) TO authenticated;

-- 3) Library storage policies: validate against library_items via join for reads/mutations
DROP POLICY IF EXISTS "library owner read" ON storage.objects;
DROP POLICY IF EXISTS "library owner update" ON storage.objects;
DROP POLICY IF EXISTS "library owner delete" ON storage.objects;
DROP POLICY IF EXISTS "library owner insert" ON storage.objects;

CREATE POLICY "library owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'library'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.library_items li
      WHERE li.storage_path = storage.objects.name
        AND li.user_id = auth.uid()
    )
  );

CREATE POLICY "library owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'library'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "library owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'library'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.library_items li
      WHERE li.storage_path = storage.objects.name
        AND li.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'library'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.library_items li
      WHERE li.storage_path = storage.objects.name
        AND li.user_id = auth.uid()
    )
  );

CREATE POLICY "library owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'library'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.library_items li
      WHERE li.storage_path = storage.objects.name
        AND li.user_id = auth.uid()
    )
  );

-- 4) Explicit owner UPDATE policy on public_chat_snapshots (defense in depth)
DROP POLICY IF EXISTS "Owners update own snapshots" ON public.public_chat_snapshots;
CREATE POLICY "Owners update own snapshots" ON public.public_chat_snapshots
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
