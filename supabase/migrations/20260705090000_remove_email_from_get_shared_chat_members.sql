CREATE OR REPLACE FUNCTION public.get_shared_chat_members(_chat_id uuid)
RETURNS TABLE(
  user_id uuid,
  role text,
  joined_at timestamptz,
  display_name text,
  username text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_id, m.role, m.joined_at, p.display_name, p.username, p.avatar_url
  FROM public.shared_chat_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.chat_id = _chat_id
    AND private.is_shared_chat_participant(_chat_id, auth.uid());
$$;
