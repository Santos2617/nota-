-- Auth applies app_metadata after INSERT. Reserve the UUID server-side instead.
alter table private.legacy_users add column pending_auth_id uuid unique;

create function public.prepare_legacy_login(legacy_id bigint) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare reserved uuid;
begin
  update private.legacy_users set pending_auth_id=coalesce(pending_auth_id,gen_random_uuid())
  where id=legacy_id and migrated_user_id is null returning pending_auth_id into reserved;
  if reserved is null then raise exception 'Conta ja migrada'; end if;
  return reserved;
end;
$$;
revoke all on function public.prepare_legacy_login(bigint) from public, anon, authenticated;
grant execute on function public.prepare_legacy_login(bigint) to service_role;

create or replace function private.create_profile() returns trigger language plpgsql security definer
set search_path = '' as $$
declare login_name text; legacy_id bigint;
begin
  login_name := lower(trim(new.raw_user_meta_data->>'username'));
  if login_name is null or login_name !~ '^[a-z0-9_.-]{3,60}$' then raise exception 'Nome de usuario invalido'; end if;
  select id into legacy_id from private.legacy_users
    where pending_auth_id=new.id and username=login_name and lower(email)=lower(new.email)
      and migrated_user_id is null;
  if legacy_id is null and exists (select 1 from private.legacy_users where username=login_name or lower(email)=lower(new.email)) then
    raise exception 'Esta conta ja existe. Use o login existente';
  end if;
  insert into public.profiles(id,username,email,name,role)
  values(new.id,login_name,lower(new.email),coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),login_name),'CLIENTE');
  if legacy_id is null then
    insert into public.customers(user_id,nome,email,cpf_cnpj,telefone,whatsapp)
    values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),login_name),lower(new.email),
      coalesce(new.raw_user_meta_data->>'cpf_cnpj',''),coalesce(new.raw_user_meta_data->>'telefone',''),coalesce(new.raw_user_meta_data->>'telefone',''));
  end if;
  return new;
end;
$$;
revoke all on function private.create_profile() from public, anon, authenticated;
