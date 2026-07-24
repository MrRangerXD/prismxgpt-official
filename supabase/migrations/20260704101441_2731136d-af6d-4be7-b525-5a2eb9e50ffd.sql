REVOKE EXECUTE ON FUNCTION public.search_invitable_users(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_invitable_users(text) TO authenticated;