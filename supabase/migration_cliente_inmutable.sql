-- ============================================================
--  Migración: una vez asignado el cliente a una Gift Card,
--  no se puede cambiar (se aplica también a nivel base de datos).
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

create or replace function public.bloquear_cambio_cliente()
returns trigger
language plpgsql
as $$
begin
  if old.cliente_id is not null and new.cliente_id is distinct from old.cliente_id then
    raise exception 'El cliente de la Gift Card ya fue asignado y no se puede cambiar';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_cambio_cliente on public.giftcards;
create trigger trg_bloquear_cambio_cliente
  before update of cliente_id on public.giftcards
  for each row execute procedure public.bloquear_cambio_cliente();
