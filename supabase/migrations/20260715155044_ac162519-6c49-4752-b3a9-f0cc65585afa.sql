-- Trigger-only function: no API caller should invoke it
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Server-only quota RPC (called with service_role from /api/image)
REVOKE EXECUTE ON FUNCTION public.consume_image_quota(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_image_quota(integer, uuid) TO service_role;

-- Signed-in-only helpers
REVOKE EXECUTE ON FUNCTION public.search_invitable_users(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_invitable_users(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_shared_chat_members(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_shared_chat_members(uuid) TO authenticated;