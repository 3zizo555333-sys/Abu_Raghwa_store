begin;

-- Managers retain direct team operations. Supervisors/admin-role members must have a valid PIN session.
drop policy if exists staff_withdrawals_manager_insert on public.staff_withdrawals;
create policy staff_withdrawals_manager_insert
  on public.staff_withdrawals for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager']::public.shop_role[]));

drop policy if exists staff_withdrawals_supervisor_pin_insert on public.staff_withdrawals;
create policy staff_withdrawals_supervisor_pin_insert
  on public.staff_withdrawals for insert to authenticated
  with check (
    public.has_shop_role(shop_id, array['admin','supervisor']::public.shop_role[])
    and public.staff_employee_pin_is_verified(shop_id)
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
  );

drop policy if exists staff_withdrawals_manager_update on public.staff_withdrawals;
create policy staff_withdrawals_manager_update
  on public.staff_withdrawals for update to authenticated
  using (public.has_shop_role(shop_id, array['manager']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager']::public.shop_role[]));

drop policy if exists staff_withdrawals_supervisor_pin_update on public.staff_withdrawals;
create policy staff_withdrawals_supervisor_pin_update
  on public.staff_withdrawals for update to authenticated
  using (
    public.has_shop_role(shop_id, array['admin','supervisor']::public.shop_role[])
    and public.staff_employee_pin_is_verified(shop_id)
  )
  with check (
    public.has_shop_role(shop_id, array['admin','supervisor']::public.shop_role[])
    and public.staff_employee_pin_is_verified(shop_id)
  );

notify pgrst, 'reload schema';
commit;
