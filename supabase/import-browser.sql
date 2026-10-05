create table public.imported_notes (
  public_id text primary key,
  note_id bigint references public.notes(id) on delete set null,
  imported_at timestamptz not null default now()
);
create index imported_notes_note_idx on public.imported_notes(note_id);
alter table public.imported_notes enable row level security;
create policy imported_notes_admin on public.imported_notes for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert on public.imported_notes to authenticated;
revoke all on public.imported_notes from anon;
insert into public.imported_notes(public_id,note_id) select public_id,id from public.notes on conflict do nothing;

create function public.import_browser_data(payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare customer jsonb; note jsonb; item jsonb; mapping jsonb := '{}';
  customer_id_new bigint; saved public.notes; count_notes integer := 0;
  count_customers integer := 0; count_renumbered integer := 0; number_new text;
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Acesso negado'; end if;
  if jsonb_typeof(payload->'customers') is distinct from 'array' or jsonb_typeof(payload->'notes') is distinct from 'array'
    or jsonb_array_length(payload->'notes') > 5000 or jsonb_array_length(payload->'customers') > 5000 then
    raise exception 'Arquivo de importação inválido ou muito grande';
  end if;
  perform pg_advisory_xact_lock(7242907);
  for customer in select * from jsonb_array_elements(payload->'customers') loop
    if coalesce(trim(customer->>'nome'),'') = '' then continue; end if;
    customer_id_new := null;
    select id into customer_id_new from public.customers c where
      (coalesce(customer->>'cpf_cnpj','') <> '' and regexp_replace(c.cpf_cnpj,'\D','','g')=regexp_replace(customer->>'cpf_cnpj','\D','','g'))
      or (coalesce(c.cpf_cnpj,'')=coalesce(customer->>'cpf_cnpj','') and c.nome=customer->>'nome' and coalesce(c.endereco,'')=coalesce(customer->>'endereco',''))
    order by id limit 1;
    if customer_id_new is null then
      insert into public.customers(nome,cpf_cnpj,telefone,whatsapp,email,endereco,cidade,estado,cep)
      values(customer->>'nome',customer->>'cpf_cnpj',customer->>'telefone',customer->>'whatsapp',customer->>'email',
        customer->>'endereco',customer->>'cidade',customer->>'estado',customer->>'cep') returning id into customer_id_new;
      count_customers := count_customers + 1;
    end if;
    mapping := mapping || jsonb_build_object(customer->>'id',customer_id_new);
  end loop;
  for note in select * from jsonb_array_elements(payload->'notes') loop
    if coalesce(note->>'public_id','') = '' then raise exception 'Nota sem código público'; end if;
    if exists(select 1 from public.imported_notes where public_id=note->>'public_id') then continue; end if;
    if exists(select 1 from public.notes where public_id=note->>'public_id') then
      insert into public.imported_notes(public_id,note_id) select public_id,id from public.notes where public_id=note->>'public_id';
      continue;
    end if;
    customer_id_new := (mapping->>(note->>'customer_id'))::bigint;
    if customer_id_new is null then raise exception 'Cliente ausente para a nota %',note->>'numero_nota'; end if;
    number_new := note->>'numero_nota';
    if coalesce(number_new,'') = '' or exists(select 1 from public.notes where numero_nota=number_new) then
      number_new := 'FS-' || to_char(now() at time zone 'America/Fortaleza','YYYY') || '-' || lpad(nextval('public.note_number_seq')::text,6,'0');
      count_renumbered := count_renumbered + 1;
    end if;
    insert into public.notes(public_id,numero_nota,customer_id,data_compra,descricao,observacoes,status,public_visible_value)
    values(note->>'public_id',number_new,customer_id_new,note->>'data_compra',note->>'descricao',note->>'observacoes',
      coalesce(note->>'status','VALIDA'),coalesce((note->>'public_visible_value')::boolean,true)) returning * into saved;
    for item in select * from jsonb_array_elements(coalesce(note->'itens','[]')) loop
      insert into public.note_items(note_id,descricao,quantidade,valor_unitario)
      values(saved.id,item->>'descricao',(item->>'quantidade')::numeric,(item->>'valor_unitario')::numeric);
    end loop;
    if not exists(select 1 from public.note_items where note_id=saved.id) then
      raise exception 'A nota % está sem itens. Importe pelo aparelho que emitiu a nota', saved.numero_nota;
    end if;
    update public.notes set valor_total=(select sum(valor_total) from public.note_items where note_id=saved.id) where id=saved.id;
    insert into public.imported_notes(public_id,note_id) values(saved.public_id,saved.id);
    count_notes := count_notes + 1;
  end loop;
  perform setval('public.note_number_seq', greatest(
    (select last_value from public.note_number_seq),
    coalesce((select max(split_part(numero_nota,'-',3)::bigint) from public.notes where numero_nota ~ '^FS-[0-9]{4}-[0-9]+$'),0)+1
  ),false);
  return jsonb_build_object('notes',count_notes,'customers',count_customers,'renumbered',count_renumbered);
end;
$$;
revoke all on function public.import_browser_data(jsonb) from public, anon;
grant execute on function public.import_browser_data(jsonb) to authenticated;
