
REVOKE EXECUTE ON FUNCTION public.consume_image_quota(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_image_quota(integer, uuid) TO service_role;
