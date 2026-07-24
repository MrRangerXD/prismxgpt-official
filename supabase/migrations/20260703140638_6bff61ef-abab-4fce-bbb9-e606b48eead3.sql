CREATE TABLE public.user_chat_state (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  threads JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_chat_state TO authenticated;
GRANT ALL ON public.user_chat_state TO service_role;

ALTER TABLE public.user_chat_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat state select"
  ON public.user_chat_state FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own chat state insert"
  ON public.user_chat_state FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own chat state update"
  ON public.user_chat_state FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own chat state delete"
  ON public.user_chat_state FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER user_chat_state_updated_at
  BEFORE UPDATE ON public.user_chat_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();