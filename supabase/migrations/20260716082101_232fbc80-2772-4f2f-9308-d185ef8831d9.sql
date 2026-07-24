
DROP POLICY IF EXISTS "Members manage chats" ON public.project_chats;
DROP POLICY IF EXISTS "Members insert messages" ON public.project_messages;

CREATE POLICY "Owners manage chats" ON public.project_chats
  FOR ALL TO authenticated
  USING (private.is_project_owner(project_id, auth.uid()))
  WITH CHECK (private.is_project_owner(project_id, auth.uid()));

CREATE POLICY "Owners insert messages" ON public.project_messages
  FOR INSERT TO authenticated
  WITH CHECK (private.is_project_owner(private.chat_project_id(chat_id), auth.uid()));
