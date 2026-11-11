create or replace function public.caldo_set_store_status(p_open boolean,p_password text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare closing timestamptz;
begin
 if caldo_private.panel_role() is distinct from 'admin' then
  raise exception 'Acesso administrativo inválido.' using errcode='42501';
 end if;
 closing:=((now() at time zone 'America/Rio_Branco')::date+time '21:45') at time zone 'America/Rio_Branco';
 if p_open and now()>=closing then raise exception 'O atendimento encerrou às 21h45 do Acre. Abra novamente amanhã.'; end if;
 update public.caldo_store_settings set is_open=p_open,closes_at=closing,updated_at=clock_timestamp()
 where id=1 and updated_at=p_expected_updated_at;
 if not found then raise exception 'O status mudou em outro aparelho. Atualize e tente novamente.'; end if;
 return public.caldo_store_status();
end $$;
revoke all on function public.caldo_set_store_status(boolean,text,timestamptz) from public;
grant execute on function public.caldo_set_store_status(boolean,text,timestamptz) to anon,authenticated,service_role;
