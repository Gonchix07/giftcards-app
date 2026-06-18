-- ============================================================
--  Migración: restricciones de borrado
--   - No se puede eliminar una empresa con gift cards asignadas
--   - No se puede eliminar un cliente con gift cards asignadas
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

-- Empresa
create or replace function public.prevenir_borrado_empresa()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.giftcards where empresa_id = old.id) then
    raise exception 'No se puede eliminar una empresa que tiene gift cards asignadas';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevenir_borrado_empresa on public.empresas;
create trigger trg_prevenir_borrado_empresa
  before delete on public.empresas
  for each row execute procedure public.prevenir_borrado_empresa();

-- Cliente
create or replace function public.prevenir_borrado_cliente()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.giftcards where cliente_id = old.id) then
    raise exception 'No se puede eliminar un cliente que tiene gift cards asignadas';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevenir_borrado_cliente on public.clientes;
create trigger trg_prevenir_borrado_cliente
  before delete on public.clientes
  for each row execute procedure public.prevenir_borrado_cliente();
