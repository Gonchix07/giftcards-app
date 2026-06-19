-- ============================================================
--  Migración: auditoría de movimientos de gift cards
--   - Tabla auditoria (sin referencias a otras tablas)
--   - Trigger que registra creación/modificación/asignación/uso/anulación/eliminación
--   - RLS: lectura e inserción para autenticados; sin update/delete (no se puede borrar)
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  usuario_email text,
  usuario_rol text,
  accion text not null,
  giftcard_codigo text,
  empresa text,
  cliente text,
  detalle text
);

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_rol text;
  v_accion text;
  v_codigo text;
  v_empresa text;
  v_cliente text;
  v_detalle text;
begin
  select email, role into v_email, v_rol from public.profiles where id = auth.uid();

  if (tg_op = 'INSERT') then
    v_codigo := new.codigo;
    v_accion := 'creacion';
    v_detalle := 'Monto máximo ' || new.monto_max ||
                 case when new.cliente_id is not null then ' (asignada al crear)' else '' end;
    select nombre into v_empresa from public.empresas where id = new.empresa_id;
    if new.cliente_id is not null then
      select nombre into v_cliente from public.clientes where id = new.cliente_id;
    end if;

  elsif (tg_op = 'UPDATE') then
    v_codigo := new.codigo;
    select nombre into v_empresa from public.empresas where id = new.empresa_id;
    if new.cliente_id is not null then
      select nombre into v_cliente from public.clientes where id = new.cliente_id;
    end if;

    if (new.cliente_id is distinct from old.cliente_id and old.cliente_id is null) then
      v_accion := 'asignacion';
      v_detalle := 'Cliente asignado: ' || coalesce(v_cliente, '');
    elsif (new.estado = 'anulada' and old.estado <> 'anulada') then
      v_accion := 'anulacion';
      v_detalle := 'Gift card anulada';
    elsif (new.saldo is distinct from old.saldo) then
      v_accion := 'uso';
      v_detalle := 'Saldo ' || old.saldo || ' -> ' || new.saldo;
    else
      v_accion := 'modificacion';
      v_detalle := 'Modificación de datos';
    end if;

  elsif (tg_op = 'DELETE') then
    v_codigo := old.codigo;
    v_accion := 'eliminacion';
    v_detalle := 'Gift card eliminada';
    select nombre into v_empresa from public.empresas where id = old.empresa_id;
  end if;

  insert into public.auditoria (usuario_email, usuario_rol, accion, giftcard_codigo, empresa, cliente, detalle)
  values (v_email, v_rol, v_accion, v_codigo, v_empresa, v_cliente, v_detalle);

  if (tg_op = 'DELETE') then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_auditoria_giftcards on public.giftcards;
create trigger trg_auditoria_giftcards
  after insert or update or delete on public.giftcards
  for each row execute procedure public.registrar_auditoria();

alter table public.auditoria enable row level security;

drop policy if exists "auditoria select" on public.auditoria;
create policy "auditoria select" on public.auditoria
  for select to authenticated using (true);

drop policy if exists "auditoria insert" on public.auditoria;
create policy "auditoria insert" on public.auditoria
  for insert to authenticated with check (true);
