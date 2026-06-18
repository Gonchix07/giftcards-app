-- ============================================================
--  Migración: quitar la restricción de 9 dígitos del DNI
--  Ejecutar en Supabase -> SQL Editor -> Run (si ya creaste la tabla clientes).
--  El DNI sigue siendo obligatorio y único, pero acepta cualquier formato.
-- ============================================================

alter table public.clientes drop constraint if exists clientes_dni_check;
