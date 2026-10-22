begin;

create or replace function public.guard_staff_withdrawal_review_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_shop_role(old.shop_id, array['manager']::public.shop_role[]) then
    if new.id is distinct from old.id
      or new.shop_id is distinct from old.shop_id
      or new.employee_id is distinct from old.employee_id
      or new.requested_at is distinct from old.requested_at
      or new.created_at is distinct from old.created_at then
      raise exception 'STAFF_WITHDRAWAL_ROW_IDENTITY_FORBIDDEN' using errcode = '42501';
    end if;

    if new.status is distinct from old.status
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by then
      raise exception 'STAFF_WITHDRAWAL_REVIEW_FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_staff_withdrawal_review_fields() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
