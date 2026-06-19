-- ============================================================
--  Migración: nuevo rol "atencion" (Atención al Cliente)
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'cajero', 'atencion'));
