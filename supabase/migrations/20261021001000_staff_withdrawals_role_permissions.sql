begin;

-- السياسة العامة السابقة كانت تسمح لكل عضو بقراءة كل سحوبات المتجر.
drop policy if exists staff_withdrawals_member_read on public.staff_withdrawals;
drop policy if exists staff_withdrawals_manager_read on public.staff_withdrawals;
create policy staff_withdrawals_manager_read
on public.staff_withdrawals for select to authenticated
using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy staff_withdrawals_employee_read
on public.staff_withdrawals for select to authenticated
using (
  exists (
    select 1
    from public.staff_employees e
    where e.id = public.staff_withdrawals.employee_id
      and e.shop_id = public.staff_withdrawals.shop_id
      and e.auth_user_id = auth.uid()
      and e.is_active
      and e.deleted_at is null
  )
);

-- العامل يستطيع إضافة سحبته المعلقة فقط؛ لا يستطيع قراءة أو تعديل سجل زملائه.
drop policy if exists staff_withdrawals_employee_insert on public.staff_withdrawals;
create policy staff_withdrawals_employee_insert
on public.staff_withdrawals for insert to authenticated
with check (
  public.is_shop_member(shop_id)
  and exists (
    select 1
    from public.staff_employees e
    where e.id = public.staff_withdrawals.employee_id
      and e.shop_id = public.staff_withdrawals.shop_id
      and e.auth_user_id = auth.uid()
      and e.is_active
      and e.deleted_at is null
  )
  and status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
);

-- الإدارة تحتاج حذف السجلات الخاطئة وتعديل المبلغ/البيان واعتماد السحب.
drop policy if exists staff_withdrawals_manager_delete on public.staff_withdrawals;
create policy staff_withdrawals_manager_delete
on public.staff_withdrawals for delete to authenticated
using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

-- التحديث الإداري القائم يظل محصوراً في الإدارة؛ العامل لا يملك update أو delete.
notify pgrst, 'reload schema';
commit;
