CREATE INDEX IF NOT EXISTS shared_chats_owner_idx ON public.shared_chats(owner_id);
CREATE INDEX IF NOT EXISTS shared_chat_members_user_chat_idx ON public.shared_chat_members(user_id, chat_id);
CREATE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON public.profiles (lower(email));
CREATE INDEX IF NOT EXISTS profiles_display_name_lower_idx ON public.profiles (lower(display_name));