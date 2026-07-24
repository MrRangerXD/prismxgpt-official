REVOKE EXECUTE ON FUNCTION public.search_invitable_users(text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_shared_chat_members(uuid) FROM authenticated, anon, PUBLIC;