-- ============================================================
--  Crear usuario cajero
--  email:    cajero1@hergo.com.ar
--  password: caja1234
--
--  RECOMENDADO: crearlo desde Authentication -> Add user (Auto Confirm).
--  El rol 'cajero' se asigna solo (default del trigger handle_new_user).
-- ============================================================

-- Por las dudas, limpiar un intento previo fallido:
delete from auth.users where email = 'cajero1@hergo.com.ar';

with nuevo_usuario as (
  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated', 'cajero1@hergo.com.ar',
    crypt('caja1234', gen_salt('bf')),
    now(), now(), now(),
    '', '', '', '',                              -- columnas de token: vacías, no NULL
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"cajero"}'::jsonb
  )
  returning id, email
)
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), id, id::text,
  jsonb_build_object('sub', id::text, 'email', email),
  'email', now(), now(), now()
from nuevo_usuario;

-- Asegura el rol cajero en el perfil
update public.profiles set role = 'cajero' where email = 'cajero1@hergo.com.ar';
