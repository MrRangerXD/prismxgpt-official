-- Fix 1: Prevent users from escalating their own plan via profiles UPDATE
CREATE OR REPLACE FUNCTION private.prevent_profile_plan_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
      NEW.plan := OLD.plan;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_plan_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_plan_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.prevent_profile_plan_escalation();

-- Fix 2: Prevent enumeration of public_chat_snapshots. Remove blanket SELECT
-- policy for anon and expose read only via a SECURITY DEFINER RPC that requires
-- the caller to know the snapshot id (UUID).
DROP POLICY IF EXISTS "Anyone can view a snapshot by id" ON public.public_chat_snapshots;

CREATE POLICY "Owners can view their snapshots"
  ON public.public_chat_snapshots
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_public_chat_snapshot(snapshot_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  messages jsonb,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.id, s.title, s.messages, s.created_at
  FROM public.public_chat_snapshots s
  WHERE s.id = snapshot_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_chat_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_chat_snapshot(uuid) TO anon, authenticated;