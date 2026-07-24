
-- Allow owner to invite any user (not just self)
DROP POLICY IF EXISTS "Owner can invite members" ON public.shared_chat_members;
CREATE POLICY "Owner can invite members" ON public.shared_chat_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shared_chats c
    WHERE c.id = shared_chat_members.chat_id AND c.owner_id = auth.uid()
  ));

-- Safe search for invitable users (bypasses profiles RLS, minimal fields).
CREATE OR REPLACE FUNCTION public.search_invitable_users(_query text)
RETURNS TABLE(id uuid, display_name text, username text, email text, avatar_url text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.display_name, p.username, p.email, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND length(coalesce(_query,'')) >= 2
    AND (
      p.email ILIKE '%' || _query || '%'
      OR p.username ILIKE '%' || _query || '%'
      OR p.display_name ILIKE '%' || _query || '%'
    )
  LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.search_invitable_users(text) TO authenticated;
