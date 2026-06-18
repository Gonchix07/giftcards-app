-- ============================================================
--  Migración: solo se puede eliminar una Gift Card sin uso.
--  (Las no asignadas nunca tienen uso, así que también se pueden borrar.)
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

create or replace function public.prevenir_borrado_giftcard()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.transacciones where giftcard_id = old.id) then
    raise exception 'No se puede eliminar una Gift Card que tiene usos registrados';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevenir_borrado_giftcard on public.giftcards;
create trigger trg_prevenir_borrado_giftcard
  before delete on public.giftcards
  for each row execute procedure public.prevenir_borrado_giftcard();
