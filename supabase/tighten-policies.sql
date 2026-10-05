-- Avoid evaluating separate SELECT policies for administrators and clients.
do $$
declare entry record;
begin
  for entry in select * from (values
    ('customers','customers_admin_write'),('notes','notes_admin_write'),('note_items','items_admin_write'),
    ('note_files','files_admin_write'),('company_settings','company_admin_write'),('portfolio_items','portfolio_admin_write')
  ) as policies(table_name,policy_name) loop
    execute format('drop policy %I on public.%I',entry.policy_name,entry.table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))',entry.policy_name||'_insert',entry.table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',entry.policy_name||'_update',entry.table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))',entry.policy_name||'_delete',entry.table_name);
  end loop;
end;
$$;
drop policy portfolio_public on public.portfolio_items;
create policy portfolio_anon_read on public.portfolio_items for select to anon using (published);
create policy portfolio_read on public.portfolio_items for select to authenticated using (published or (select private.is_admin()));
alter table public.notes add constraint public_code_format check (public_id ~ '^[A-Za-z0-9_-]{8,100}$');
alter table public.notes add constraint note_number_format check (numero_nota ~ '^FS-[0-9]{4}-[0-9]+$');
alter table public.notes add constraint purchase_date_format check (data_compra ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$');
