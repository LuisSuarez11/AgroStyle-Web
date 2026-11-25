-- AgroStyle F3: Seguridad y estabilización backend Supabase (LOCAL/PRUEBAS)
-- NO aplicar en producción sin verificación remota autorizada.
-- No modifica migration.sql histórico; crea objetos/funciones/policies nuevas o reemplaza existentes.

begin;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
create or replace function public.is_approved_producer(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = uid and role = 'producer' and status = 'approved'
  );
$;
revoke all on function public.is_approved_producer(uuid) from public, anon;
grant execute on function public.is_approved_producer(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- PROFILES: proteger roles/estados/aprobación
-- ---------------------------------------------------------------------
-- Quitar self-update abierta
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_admin_read on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;

create policy profiles_self_read on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy profiles_admin_read on public.profiles
  for select
  to authenticated
  using (public.is_admin());

-- Evita recursi?n RLS: no subselects a profiles; trigger enforce_profile_update valida columnas.
create policy profiles_self_update on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admin updates directos restringidos por trigger; policy permite admin pero trigger valida columnas/transiciones.
create policy profiles_admin_update on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.enforce_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_is_admin boolean := public.is_admin();
begin
  -- Nadie cambia identidad base
  if new.id is distinct from old.id then raise exception 'profiles.id es inmutable'; end if;
  if new.email is distinct from old.email then raise exception 'profiles.email es inmutable'; end if;
  if new.created_at is distinct from old.created_at then raise exception 'profiles.created_at es inmutable'; end if;

  if actor_is_admin then
    -- Admin puede aprobar/rechazar/cambiar campos administrativos controlados, no autoescalamiento arbitrario de otros admins aquí.
    if new.role is distinct from old.role then
      raise exception 'Cambio de rol no permitido en F3';
    end if;
    if new.status not in ('pending','approved','rejected') then
      raise exception 'Estado de perfil inválido';
    end if;
    -- Permitir cambios administrativos normales; auditoría básica por campos existentes
    return new;
  end if;

  -- Owner: solo full_name
  if actor is distinct from old.id then
    raise exception 'No autorizado';
  end if;
  if new.role is distinct from old.role then raise exception 'No puedes cambiar tu rol'; end if;
  if new.status is distinct from old.status then raise exception 'No puedes cambiar tu estado'; end if;
  if new.rejection_reason is distinct from old.rejection_reason then raise exception 'No puedes cambiar rejection_reason'; end if;
  if new.approved_at is distinct from old.approved_at then raise exception 'No puedes cambiar approved_at'; end if;
  if new.approved_by is distinct from old.approved_by then raise exception 'No puedes cambiar approved_by'; end if;
  if new.rejected_at is distinct from old.rejected_at then raise exception 'No puedes cambiar rejected_at'; end if;
  if new.rejected_by is distinct from old.rejected_by then raise exception 'No puedes cambiar rejected_by'; end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_update on public.profiles;
create trigger trg_enforce_profile_update
before update on public.profiles
for each row execute function public.enforce_profile_update();

-- RPCs admin para aprobación/rechazo
create or replace function public.admin_approve_profile(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  update public.profiles
  set status='approved', approved_at=now(), approved_by=auth.uid(), rejected_at=null, rejected_by=null, rejection_reason=null
  where id=target_id and role in ('producer','buyer','transporter','admin');
  if not found then raise exception 'Perfil no encontrado'; end if;
end;
$$;

create or replace function public.admin_reject_profile(target_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reason text := nullif(btrim(coalesce(reason,'')), '');
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  if clean_reason is null then raise exception 'Motivo de rechazo requerido'; end if;
  update public.profiles
  set status='rejected', rejected_at=now(), rejected_by=auth.uid(), rejection_reason=clean_reason
  where id=target_id and role in ('producer','buyer','transporter','admin');
  if not found then raise exception 'Perfil no encontrado'; end if;
end;
$$;

revoke all on function public.admin_approve_profile(uuid) from public, anon;
grant execute on function public.admin_approve_profile(uuid) to authenticated;
revoke all on function public.admin_reject_profile(uuid,text) from public, anon;
grant execute on function public.admin_reject_profile(uuid,text) to authenticated;

-- ---------------------------------------------------------------------
-- FARMS: owner/admin control, no public sensitive leak by default kept as-is?
-- Current app uses farms_public_read for buyers; keep read but tighten writes/deletes.
-- ---------------------------------------------------------------------
drop policy if exists farms_owner_all on public.farms;
drop policy if exists farms_public_read on public.farms;
drop policy if exists farms_admin_all on public.farms;

create policy farms_public_read on public.farms
  for select using (true);

create policy farms_owner_insert on public.farms
  for insert
  to authenticated
  with check (producer_id = auth.uid() and public.is_approved_producer(auth.uid()));
create policy farms_owner_update on public.farms
  for update
  to authenticated
  using (producer_id = auth.uid())
  with check (producer_id = auth.uid());
create policy farms_owner_select on public.farms
  for select
  to authenticated
  using (producer_id = auth.uid());
create policy farms_admin_all on public.farms
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.enforce_farm_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.producer_id is distinct from auth.uid() and not public.is_admin() then
      raise exception 'producer_id inválido';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.producer_id is distinct from old.producer_id then
      raise exception 'producer_id es inmutable';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at es inmutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_farm_write on public.farms;
create trigger trg_enforce_farm_write
before insert or update on public.farms
for each row execute function public.enforce_farm_write();

create or replace function public.delete_farm_safe(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_has_products boolean;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select producer_id into v_owner from public.farms where id = p_farm_id;
  if not found then raise exception 'Finca no encontrada'; end if;
  if v_owner is distinct from v_actor and not public.is_admin() then raise exception 'No autorizado'; end if;

  select exists(select 1 from public.products where farm_id = p_farm_id) into v_has_products;
  if v_has_products then
    raise exception 'No se puede eliminar la finca porque tiene productos asociados';
  end if;

  delete from public.farms where id = p_farm_id;
end;
$;
revoke all on function public.delete_farm_safe(uuid) from public, anon;
grant execute on function public.delete_farm_safe(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- PRODUCTS: proteger campos, precio/stock/disponibilidad, ownership
-- ---------------------------------------------------------------------
alter table public.products drop constraint if exists products_quantity_check;
alter table public.products add constraint products_quantity_check check (quantity >= 0);

drop policy if exists products_owner_all on public.products;
drop policy if exists products_public_read_act on public.products;
drop policy if exists products_admin_all on public.products;

create policy products_public_read_act on public.products
  for select using (status = 'active');
create policy products_owner_read on public.products
  for select
  to authenticated
  using (producer_id = auth.uid());
create policy products_owner_insert on public.products
  for insert
  to authenticated
  with check (producer_id = auth.uid() and public.is_approved_producer(auth.uid()));
create policy products_owner_update on public.products
  for update
  to authenticated
  using (producer_id = auth.uid())
  with check (producer_id = auth.uid());
create policy products_admin_all on public.products
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.enforce_product_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  farm_owner uuid;
  farm_name text;
  farm_zone text;
  farm_lat double precision;
  farm_lng double precision;
  producer_name text;
  producer_status text;
begin
  if new.producer_id is null then raise exception 'producer_id requerido'; end if;

  if tg_op = 'UPDATE' then
    if new.producer_id is distinct from old.producer_id then raise exception 'producer_id es inmutable'; end if;
    if new.created_at is distinct from old.created_at then raise exception 'created_at es inmutable'; end if;
  end if;

  -- Validar productor
  select p.full_name, p.status into producer_name, producer_status
  from public.profiles p where p.id = new.producer_id and p.role = 'producer';
  if not found then raise exception 'Productor inválido'; end if;
  if producer_status is distinct from 'approved' and not public.is_admin() then
    if tg_op = 'INSERT' then
      raise exception 'Solo productores aprobados pueden crear productos';
    else
      raise exception 'Solo productores aprobados pueden actualizar o reactivar productos';
    end if;
  end if;

  -- Validar finca pertenece al productor
  if new.farm_id is not null then
    select f.producer_id, f.name, f.zone, f.lat, f.lng
      into farm_owner, farm_name, farm_zone, farm_lat, farm_lng
    from public.farms f where f.id = new.farm_id;
    if not found then raise exception 'Finca inválida'; end if;
    if farm_owner is distinct from new.producer_id then
      raise exception 'La finca no pertenece al productor';
    end if;
    new.farm_name := farm_name;
    new.farm_zone := farm_zone;
    new.lat := farm_lat;
    new.lng := farm_lng;
  end if;

  -- Desnormalizados confiables
  new.producer_name := producer_name;

  if new.price is null or new.price <= 0 then raise exception 'Precio inválido'; end if;
  if new.quantity is null or new.quantity < 0 then raise exception 'Cantidad inválida'; end if;
  if new.status not in ('active','sold_out','archived') then raise exception 'Estado de producto inválido'; end if;
  if new.availability_type not in ('immediate','preorder') then raise exception 'Tipo de disponibilidad inválido'; end if;

  if new.quantity = 0 and new.status = 'active' then
    new.status := 'sold_out';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_product_write on public.products;
create trigger trg_enforce_product_write
before insert or update on public.products
for each row execute function public.enforce_product_write();

-- ---------------------------------------------------------------------
-- DOCUMENTS: proteger aprobados, revisión controlada
-- ---------------------------------------------------------------------
drop policy if exists documents_owner_all on public.documents;
drop policy if exists documents_admin_read on public.documents;
drop policy if exists documents_admin_update on public.documents;
drop policy if exists documents_admin_insert on public.documents;

create policy documents_owner_select on public.documents
  for select
  to authenticated
  using (producer_id = auth.uid());
create policy documents_owner_insert on public.documents
  for insert
  to authenticated
  with check (producer_id = auth.uid() and status = 'pending');
create policy documents_admin_read on public.documents
  for select
  to authenticated
  using (public.is_admin());
create policy documents_admin_update on public.documents
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.enforce_document_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.producer_id is distinct from auth.uid() and not public.is_admin() then
      raise exception 'producer_id inválido';
    end if;
    if new.status <> 'pending' then raise exception 'Documento debe crearse como pending'; end if;
    if new.reviewed_at is not null or new.reviewed_by is not null or new.rejection_reason is not null then
      raise exception 'Campos de revisión no permitidos al crear';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'approved' and not public.is_admin() then
      raise exception 'Documento aprobado es inmutable';
    end if;
    if new.producer_id is distinct from old.producer_id then raise exception 'producer_id es inmutable'; end if;
    if new.file_url is distinct from old.file_url then raise exception 'file_url es inmutable'; end if;
    if new.file_name is distinct from old.file_name then raise exception 'file_name es inmutable'; end if;
    if new.uploaded_at is distinct from old.uploaded_at then raise exception 'uploaded_at es inmutable'; end if;
    if not public.is_admin() then
      raise exception 'Solo admin puede actualizar documentos';
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'approved' and not public.is_admin() then
      raise exception 'No se puede eliminar documento aprobado';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_enforce_document_write on public.documents;
create trigger trg_enforce_document_write
before insert or update or delete on public.documents
for each row execute function public.enforce_document_write();

create or replace function public.admin_review_document(p_doc_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  select status into v_status from public.documents where id = p_doc_id;
  if not found then raise exception 'Documento no encontrado'; end if;
  if v_status <> 'pending' then raise exception 'Solo documentos pendientes pueden revisarse'; end if;

  if p_approve then
    update public.documents
      set status='approved', reviewed_at=now(), reviewed_by=auth.uid(), rejection_reason=null
      where id=p_doc_id;
  else
    if v_reason is null then raise exception 'Motivo de rechazo requerido'; end if;
    update public.documents
      set status='rejected', reviewed_at=now(), reviewed_by=auth.uid(), rejection_reason=v_reason
      where id=p_doc_id;
  end if;
end;
$$;
revoke all on function public.admin_review_document(uuid,boolean,text) from public, anon;
grant execute on function public.admin_review_document(uuid,boolean,text) to authenticated;

-- ---------------------------------------------------------------------
-- ORDERS / ORDER_ITEMS: atomicidad, validación, transición de estados, pago simulado
-- ---------------------------------------------------------------------
drop policy if exists orders_buyer_all on public.orders;
drop policy if exists orders_producer_read on public.orders;
drop policy if exists orders_producer_update on public.orders;
drop policy if exists orders_admin_all on public.orders;
drop policy if exists order_items_insert_buyer on public.order_items;
drop policy if exists order_items_buyer_read on public.order_items;
drop policy if exists order_items_producer_read on public.order_items;

-- Orders: lectura por participantes, insert solo via RPC (o buyer insert limitado), sin update/delete directo del cliente
create policy orders_buyer_select on public.orders
  for select
  to authenticated
  using (buyer_id = auth.uid());
create policy orders_producer_select on public.orders
  for select
  to authenticated
  using (producer_id = auth.uid());
create policy orders_admin_select on public.orders
  for select
  to authenticated
  using (public.is_admin());

-- Order items: solo lectura por participantes/admin
create policy order_items_buyer_read on public.order_items
  for select
  to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid()));
create policy order_items_producer_read on public.order_items
  for select
  to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.producer_id = auth.uid()));
create policy order_items_admin_read on public.order_items
  for select
  to authenticated
  using (public.is_admin());

-- Bloquear mutaciones directas por defecto (sin policies insert/update/delete). RPCs SECURITY DEFINER harán el trabajo.

create or replace function public.enforce_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id then raise exception 'id inmutable'; end if;
  if new.buyer_id is distinct from old.buyer_id then raise exception 'buyer_id inmutable'; end if;
  if new.producer_id is distinct from old.producer_id then raise exception 'producer_id inmutable'; end if;
  if new.total is distinct from old.total then raise exception 'total inmutable'; end if;
  if new.created_at is distinct from old.created_at then raise exception 'created_at inmutable'; end if;
  if new.qr_code is distinct from old.qr_code and not (old.qr_code is null and new.qr_code is not null) then
    -- permitir asignar qr una vez
    if old.qr_code is not null and new.qr_code is distinct from old.qr_code then
      raise exception 'qr_code inmutable';
    end if;
  end if;

  -- Transiciones válidas
  if new.status is distinct from old.status then
    if old.status = 'pending_confirmation' and new.status in ('confirmed','rejected') then null;
    elsif old.status = 'confirmed' and new.status in ('paid') then null;
    elsif old.status = 'paid' and new.status in ('delivered') then null;
    else
      raise exception 'Transición de estado inválida: % -> %', old.status, new.status;
    end if;
  end if;

  if new.status = 'rejected' and nullif(btrim(coalesce(new.rejection_reason,'')), '') is null then
    raise exception 'Motivo de rechazo requerido';
  end if;
  if new.status = 'confirmed' and nullif(btrim(coalesce(new.qr_code,'')), '') is null then
    raise exception 'qr_code requerido al confirmar';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_order_update on public.orders;
create trigger trg_enforce_order_update
before update on public.orders
for each row execute function public.enforce_order_update();

-- Atomic order creation
create or replace function public.create_order_atomic(p_notes text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_buyer_name text;
  v_buyer_status text;
  v_item jsonb;
  v_product record;
  v_qty numeric;
  v_order_id uuid;
  v_producer_id uuid;
  v_producer_name text;
  v_total numeric(10,2) := 0;
  v_subtotal numeric(10,2);
  v_first boolean := true;
  v_items_tmp jsonb := '[]'::jsonb;
begin
  if v_buyer is null then raise exception 'No autenticado'; end if;
  select full_name, status into v_buyer_name, v_buyer_status from public.profiles where id = v_buyer and role = 'buyer';
  if not found then raise exception 'Solo compradores pueden crear pedidos'; end if;
  if v_buyer_status <> 'approved' then raise exception 'Comprador no aprobado'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener items';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not (v_item ? 'productId') or not (v_item ? 'quantity') then
      raise exception 'Item inválido';
    end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> trunc(v_qty) then raise exception 'Cantidad inválida'; end if;

    select id, producer_id, producer_name, name, unit, price, quantity, status, availability_type, available_date
      into v_product
    from public.products
    where id = (v_item->>'productId')::uuid
    for update;

    if not found then raise exception 'Producto no encontrado'; end if;
    if v_product.status <> 'active' then raise exception 'Producto no disponible: %', v_product.name; end if;
    if v_product.availability_type = 'immediate' and v_product.quantity < v_qty then
      raise exception 'Stock insuficiente para %', v_product.name;
    end if;
    if v_product.availability_type = 'preorder' then
      if v_product.available_date is null or v_product.available_date <= current_date then
        raise exception 'Preventa inválida para %', v_product.name;
      end if;
    end if;

    if v_first then
      v_producer_id := v_product.producer_id;
      v_producer_name := v_product.producer_name;
      v_first := false;
    elsif v_producer_id is distinct from v_product.producer_id then
      raise exception 'El pedido debe contener productos de un solo productor';
    end if;

    v_subtotal := round((v_product.price::numeric * v_qty)::numeric, 2);
    v_total := v_total + v_subtotal;
    v_items_tmp := v_items_tmp || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'unit', v_product.unit,
      'price', v_product.price,
      'quantity', v_qty,
      'subtotal', v_subtotal,
      'is_preorder', v_product.availability_type = 'preorder',
      'available_date', v_product.available_date,
      'availability_type', v_product.availability_type
    ));
  end loop;

  insert into public.orders (buyer_id, buyer_name, producer_id, producer_name, status, total, notes)
  values (v_buyer, v_buyer_name, v_producer_id, coalesce(v_producer_name,''), 'pending_confirmation', round(v_total,2), nullif(btrim(coalesce(p_notes,'')), ''))
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_items_tmp)
  loop
    insert into public.order_items (
      order_id, product_id, product_name, unit, price, quantity, subtotal, is_preorder, available_date
    ) values (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      v_item->>'unit',
      (v_item->>'price')::numeric,
      (v_item->>'quantity')::numeric,
      (v_item->>'subtotal')::numeric,
      (v_item->>'is_preorder')::boolean,
      case when v_item->>'available_date' is null or v_item->>'available_date' = 'null' then null else (v_item->>'available_date')::date end
    );

    if v_item->>'availability_type' = 'immediate' then
      update public.products
      set quantity = quantity - (v_item->>'quantity')::int,
          status = case when quantity - (v_item->>'quantity')::int <= 0 then 'sold_out' else status end
      where id = (v_item->>'product_id')::uuid;
    end if;
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.create_order_atomic(text,jsonb) from public, anon;
grant execute on function public.create_order_atomic(text,jsonb) to authenticated;

create or replace function public.producer_confirm_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $
declare
  v_actor uuid := auth.uid();
  v_order public.orders;
  v_qr text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_order.producer_id is distinct from v_actor and not public.is_admin() then raise exception 'No autorizado'; end if;
  if v_order.status is distinct from 'pending_confirmation' then raise exception 'Solo pedidos pendientes pueden confirmarse'; end if;
  v_qr := 'AGROSTYLE-PAY-' || p_order_id::text;
  update public.orders set status='confirmed', qr_code=v_qr where id=p_order_id returning * into v_order;
  return v_order;
end;
$;
revoke all on function public.producer_confirm_order(uuid) from public, anon;
grant execute on function public.producer_confirm_order(uuid) to authenticated;

create or replace function public.producer_reject_order(p_order_id uuid, p_reason text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $
declare
  v_actor uuid := auth.uid();
  v_order public.orders;
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
  v_item record;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if v_reason is null then raise exception 'Motivo de rechazo requerido'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_order.producer_id is distinct from v_actor and not public.is_admin() then raise exception 'No autorizado'; end if;
  if v_order.status is distinct from 'pending_confirmation' then raise exception 'Solo pedidos pendientes pueden rechazarse'; end if;

  -- Restaurar stock para items inmediatos
  for v_item in
    select oi.product_id, oi.quantity, oi.is_preorder
    from public.order_items oi where oi.order_id = p_order_id
  loop
    if v_item.product_id is not null and v_item.is_preorder = false then
      update public.products
        set quantity = quantity + v_item.quantity::int,
            status = case when status = 'sold_out' and quantity + v_item.quantity::int > 0 then 'active' else status end
        where id = v_item.product_id;
    end if;
  end loop;

  update public.orders
    set status='rejected', rejection_reason=v_reason
    where id=p_order_id returning * into v_order;
  return v_order;
end;
$;
revoke all on function public.producer_reject_order(uuid,text) from public, anon;
grant execute on function public.producer_reject_order(uuid,text) to authenticated;

create or replace function public.simulate_pay_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $
declare
  v_actor uuid := auth.uid();
  v_order public.orders;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_order.buyer_id is distinct from v_actor and not public.is_admin() then raise exception 'No autorizado'; end if;
  if v_order.status is distinct from 'confirmed' then raise exception 'Solo pedidos confirmados pueden pagarse'; end if;
  update public.orders set status='paid' where id=p_order_id returning * into v_order;
  return v_order;
end;
$;
revoke all on function public.simulate_pay_order(uuid) from public, anon;
grant execute on function public.simulate_pay_order(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- STORAGE: proteger rutas y documentos aprobados
-- ---------------------------------------------------------------------
create or replace function public.storage_object_is_approved_document(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.documents d
    where d.status = 'approved'
      and d.file_url like '%' || object_name
  );
$;

revoke all on function public.storage_object_is_approved_document(text) from public, anon;
grant execute on function public.storage_object_is_approved_document(text) to authenticated;

drop policy if exists "agrostyle_public_read" on storage.objects;
drop policy if exists "agrostyle_auth_insert" on storage.objects;
drop policy if exists "agrostyle_owner_update" on storage.objects;
drop policy if exists "agrostyle_owner_delete" on storage.objects;

create policy "agrostyle_public_read" on storage.objects
  for select using (bucket_id = 'agrostyle');

-- Insert only into own prefixed folders
create policy "agrostyle_auth_insert_own_prefix" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agrostyle'
    and (
      name like 'products/' || auth.uid()::text || '/%'
      or name like 'documents/' || auth.uid()::text || '/%'
      or name like 'misc/' || auth.uid()::text || '/%'
    )
  );

-- Block update/delete for approved document objects; allow owner on own prefix otherwise
create policy "agrostyle_owner_update_safe" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'agrostyle'
    and owner = auth.uid()
    and not public.storage_object_is_approved_document(name)
  )
  with check (
    bucket_id = 'agrostyle'
    and owner = auth.uid()
    and not public.storage_object_is_approved_document(name)
  );

create policy "agrostyle_owner_delete_safe" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'agrostyle'
    and owner = auth.uid()
    and not public.storage_object_is_approved_document(name)
  );

-- Safe product delete/archive
create or replace function public.delete_product_safe(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_has_orders boolean;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select producer_id into v_owner from public.products where id = p_product_id;
  if not found then raise exception 'Producto no encontrado'; end if;
  if v_owner is distinct from v_actor and not public.is_admin() then raise exception 'No autorizado'; end if;

  select exists(select 1 from public.order_items where product_id = p_product_id) into v_has_orders;
  if v_has_orders then
    update public.products set status = 'archived' where id = p_product_id;
  else
    delete from public.products where id = p_product_id;
  end if;
end;
$;
revoke all on function public.delete_product_safe(uuid) from public, anon;
grant execute on function public.delete_product_safe(uuid) to authenticated;

commit;


