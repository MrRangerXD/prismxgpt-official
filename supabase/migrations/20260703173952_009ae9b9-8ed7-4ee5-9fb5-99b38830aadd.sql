
DO $$
DECLARE
  target_email text := 'zensei@zenseihub.in';
  new_secret text := encode(gen_random_bytes(48), 'base64');
BEGIN
  UPDATE auth.users
     SET encrypted_password = crypt(new_secret, gen_salt('bf')),
         updated_at = now()
   WHERE lower(email) = lower(target_email);
END $$;
