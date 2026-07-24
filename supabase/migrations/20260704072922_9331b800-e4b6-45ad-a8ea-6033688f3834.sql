REVOKE EXECUTE ON FUNCTION public.consume_image_quota(integer) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.consume_image_quota(integer) TO service_role;