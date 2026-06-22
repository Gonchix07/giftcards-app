-- ============================================================
--  Migración: comercios como entidad (nombre + logo)
--   - Tabla comercios (el logo pertenece al comercio)
--   - RLS: lectura autenticados, escritura admin
--   - Seed de los dos comercios actuales
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

create table if not exists public.comercios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  logo_url text,
  created_at timestamptz not null default now()
);

alter table public.comercios enable row level security;

drop policy if exists "comercios select" on public.comercios;
create policy "comercios select" on public.comercios
  for select to authenticated using (true);

drop policy if exists "comercios admin" on public.comercios;
create policy "comercios admin" on public.comercios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Migra los comercios existentes usados por las empresas
insert into public.comercios (nombre, logo_url)
select distinct e.comercio, null
from public.empresas e
where e.comercio is not null and e.comercio <> ''
on conflict (nombre) do nothing;
