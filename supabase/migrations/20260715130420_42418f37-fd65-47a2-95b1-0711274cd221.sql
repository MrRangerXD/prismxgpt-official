DROP FUNCTION IF EXISTS public.search_invitable_users(text);
CREATE FUNCTION public.search_invitable_users(_query text)
RETURNS TABLE(id uuid, display_name text, username text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean text := replace(replace(coalesce(_query, ''), '%', ''), '_', '');
BEGIN
  IF auth.uid() IS NULL OR length(_clean) < 3 THEN
    RETURN;
  END IF;
  RETURN QUERY EXECUTE
    'SELECT p.id, p.display_name, p.username, p.avatar_url
     FROM public.profiles p
     WHERE p.id <> $1
       AND (p.username ILIKE $2 OR p.display_name ILIKE $2)
     LIMIT 20'
    USING auth.uid(), '%' || _clean || '%';
END;
$$;
REVOKE ALL ON FUNCTION public.search_invitable_users(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_invitable_users(text) TO authenticated;