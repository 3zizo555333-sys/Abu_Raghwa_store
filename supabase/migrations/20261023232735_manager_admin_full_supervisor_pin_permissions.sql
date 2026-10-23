begin;

-- Full administrator roles are manager and admin; supervisor alone uses the PIN gate.
drop policy if exists staff_employees_manager_read on public.staff_employees;
create policy staff_employees_manager_read on public.staff_employees for select to authenticated using (public.has_shop_role(shop_id,array['manager','admin']::public.shop_role[]) and deleted_at is null);
drop policy if exists staff_employees_supervisor_read on public.staff_employees;
create policy staff_employees_supervisor_read on public.staff_employees for select to authenticated using (public.has_shop_role(shop_id,array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id) and deleted_at is null);
drop policy if exists staff_attendance_manager_read on public.staff_attendance;
create policy staff_attendance_manager_read on public.staff_attendance for select to authenticated using (public.has_shop_role(shop_id,array['manager','admin']::public.shop_role[]));
drop policy if exists staff_attendance_supervisor_pin_read on public.staff_attendance;
create policy staff_attendance_supervisor_pin_read on public.staff_attendance for select to authenticated using (public.has_shop_role(shop_id,array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id));
drop policy if exists staff_withdrawals_manager_read on public.staff_withdrawals;
create policy staff_withdrawals_manager_read on public.staff_withdrawals for select to authenticated using (public.has_shop_role(shop_id,array['manager','admin']::public.shop_role[]));
drop policy if exists staff_withdrawals_supervisor_pin_read on public.staff_withdrawals;
create policy staff_withdrawals_supervisor_pin_read on public.staff_withdrawals for select to authenticated using (public.has_shop_role(shop_id,array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id));
drop policy if exists staff_withdrawals_manager_insert on public.staff_withdrawals;
create policy staff_withdrawals_manager_insert on public.staff_withdrawals for insert to authenticated with check (public.has_shop_role(shop_id,array['manager','admin']::public.shop_role[]));
drop policy if exists staff_withdrawals_supervisor_pin_insert on public.staff_withdrawals;
create policy staff_withdrawals_supervisor_pin_insert on public.staff_withdrawals for insert to authenticated with check (public.has_shop_role(shop_id,array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id) and status='pending' and reviewed_at is null and reviewed_by is null);
drop policy if exists staff_withdrawals_manager_update on public.staff_withdrawals;
create policy staff_withdrawals_manager_update on public.staff_withdrawals for update to authenticated using (public.has_shop_role(shop_id,array['manager','admin']::public.shop_role[])) with check (public.has_shop_role(shop_id,array['manager','admin']::public.shop_role[]));
drop policy if exists staff_withdrawals_supervisor_pin_update on public.staff_withdrawals;
create policy staff_withdrawals_supervisor_pin_update on public.staff_withdrawals for update to authenticated using (public.has_shop_role(shop_id,array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id)) with check (public.has_shop_role(shop_id,array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id));
drop policy if exists staff_withdrawals_manager_delete on public.staff_withdrawals;
create policy staff_withdrawals_manager_delete on public.staff_withdrawals for delete to authenticated using (public.has_shop_role(shop_id,array['manager','admin']::public.shop_role[]));

create or replace function public.guard_staff_withdrawal_review_fields()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if public.has_shop_role(old.shop_id,array['manager','admin']::public.shop_role[]) then return new; end if;
  if not public.has_shop_role(old.shop_id,array['supervisor']::public.shop_role[]) or not public.staff_employee_pin_is_verified(old.shop_id) then
    raise exception 'STAFF_WITHDRAWAL_SUPERVISOR_PIN_REQUIRED' using errcode='42501';
  end if;
  if (to_jsonb(new)-array['amount','description','updated_at']) is distinct from (to_jsonb(old)-array['amount','description','updated_at']) then
    raise exception 'STAFF_WITHDRAWAL_SUPERVISOR_FIELDS_FORBIDDEN' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.guard_staff_withdrawal_review_fields() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
