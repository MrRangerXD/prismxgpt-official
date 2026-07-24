-- Move public snapshot RPC out of the exposed API schema
REVOKE EXECUTE ON FUNCTION public.get_public_chat_snapshot(uuid) FROM anon, authenticated, PUBLIC;
DROP FUNCTION IF EXISTS public.get_public_chat_snapshot(uuid);

CREATE OR REPLACE FUNCTION private.get_public_chat_snapshot(snapshot_id uuid)
RETURNS TABLE(id uuid, title text, messages jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.title, s.messages, s.created_at
  FROM public.public_chat_snapshots s
  WHERE s.id = snapshot_id;
$$;
REVOKE ALL ON FUNCTION private.get_public_chat_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_public_chat_snapshot(uuid) TO service_role;