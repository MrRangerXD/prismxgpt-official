
DROP POLICY IF EXISTS "Users insert own actions" ON public.activity_log;

CREATE POLICY "Admins insert audit actions" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND private.has_role(auth.uid(), 'admin'::public.app_role)
    AND action IN ('role.grant','role.revoke','settings.update','plan.update','user.signup')
  );

REVOKE INSERT ON public.activity_log FROM authenticated;
GRANT INSERT (actor_id, target_id, action, metadata) ON public.activity_log TO authenticated;
