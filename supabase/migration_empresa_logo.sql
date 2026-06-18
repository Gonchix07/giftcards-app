-- ============================================================
--  Migración: comercio + logo por empresa
--   - Agrega columnas comercio y logo_url a empresas
--   - Crea el bucket público 'logos' en Supabase Storage
--   - Habilita subir/leer logos a usuarios autenticados (admin escribe)
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

-- Columnas
alter table public.empresas add column if not exists comercio text;
alter table public.empresas add column if not exists logo_url text;

-- Bucket público para logos (idempotente)
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

-- Políticas de acceso al bucket 'logos'
-- Lectura pública (para mostrar los logos sin autenticación)
drop policy if exists "logos lectura publica" on storage.objects;
create policy "logos lectura publica" on storage.objects
  for select using (bucket_id = 'logos');

-- Subir / actualizar / borrar: solo administradores autenticados
drop policy if exists "logos admin escribe" on storage.objects;
create policy "logos admin escribe" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and public.is_admin());

drop policy if exists "logos admin actualiza" on storage.objects;
create policy "logos admin actualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and public.is_admin());

drop policy if exists "logos admin borra" on storage.objects;
create policy "logos admin borra" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and public.is_admin());
