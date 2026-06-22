-- ============================================================
--  Migración: nuevo rol "tesoreria" (acceso a Inicio y Reportes)
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'cajero', 'atencion', 'tesoreria'));
