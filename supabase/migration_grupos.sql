-- ============================================================
--  Migración: grupos de clientes
--   - Tabla grupos
--   - Columna grupo_id en clientes
--   - RLS (lectura autenticados, escritura admin)
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

alter table public.clientes
  add column if not exists grupo_id uuid references public.grupos(id) on delete set null;

alter table public.grupos enable row level security;

drop policy if exists "grupos select" on public.grupos;
create policy "grupos select" on public.grupos
  for select to authenticated using (true);

drop policy if exists "grupos admin" on public.grupos;
create policy "grupos admin" on public.grupos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
