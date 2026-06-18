-- ============================================================
--  Crear usuario administrador
--  email:    sistemas@hergo.com.ar
--  password: 1qazxsw2
--
--  RECOMENDADO: crear el usuario desde Authentication -> Add user
--  (Auto Confirm) y luego correr solo el UPDATE del final.
--  Este insert por SQL funciona pero es sensible a la versión de Supabase.
-- ============================================================

-- Por las dudas, limpiar un intento previo fallido:
delete from auth.users where email = 'sistemas@hergo.com.ar';

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
    'authenticated', 'authenticated', 'sistemas@hergo.com.ar',
    crypt('1qazxsw2', gen_salt('bf')),
    now(), now(), now(),
    '', '', '', '',                              -- columnas de token: deben ir vacías, no NULL
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin"}'::jsonb
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

-- Garantiza que el perfil quede con rol admin
update public.profiles set role = 'admin' where email = 'sistemas@hergo.com.ar';
