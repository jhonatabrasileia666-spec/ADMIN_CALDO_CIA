create or replace function public.caldo_criar_pedido(p_pedido jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_item jsonb; v_product public.cardapio%rowtype; v_items jsonb:='[]'::jsonb;
 v_qty integer; v_price numeric; v_total numeric:=0; v_expected numeric;
 v_name text; v_extra text; v_extras text; v_extra_price numeric; v_id bigint;
 v_type text:=p_pedido->>'tipo_pedido';
begin
 if jsonb_typeof(p_pedido) is distinct from 'object'
 or char_length(btrim(coalesce(p_pedido->>'cliente_nome','')))<1
 or char_length(coalesce(p_pedido->>'cliente_nome',''))>120
 or char_length(coalesce(p_pedido->>'cliente_telefone',''))>40
 or char_length(coalesce(p_pedido->>'endereco',''))>2000
 or char_length(coalesce(p_pedido->>'referencia',''))>1000
 or char_length(coalesce(p_pedido->>'forma_pagamento',''))>200
 or v_type not in ('entrega','retirada','local') or v_type is null
 then raise exception 'Dados do pedido inválidos'; end if;
 if jsonb_typeof(p_pedido->'itens') is distinct from 'array' then raise exception 'Carrinho inválido'; end if;
 if jsonb_array_length(p_pedido->'itens') not between 1 and 100 then raise exception 'Carrinho inválido'; end if;
 if v_type='entrega' and char_length(btrim(coalesce(p_pedido->>'endereco','')))=0 then raise exception 'Informe o endereço'; end if;
 for v_item in select value from jsonb_array_elements(p_pedido->'itens') loop
  v_name:=v_item->>'nome';
  if v_name is null or char_length(v_name)>500 or char_length(coalesce(v_item->>'obs',''))>1000
     or coalesce(v_item->>'quantidade','') !~ '^[0-9]{1,2}$'
  then raise exception 'Item inválido'; end if;
  v_qty:=(v_item->>'quantidade')::integer;
  if v_qty not between 1 and 99 then raise exception 'Quantidade inválida'; end if;
  select * into v_product from public.cardapio c
   where c.ativo and (v_name=c.nome or starts_with(v_name,c.nome||' ('))
   order by char_length(c.nome) desc limit 1;
  if not found then raise exception 'Produto indisponível. Atualize o cardápio.'; end if;
  v_price:=v_product.preco;
  v_extras:=substring(v_name from '\(\+ ([^)]*)\)$');
  if v_extras is not null then
   for v_extra in select unnest(string_to_array(v_extras,', ')) loop
    v_extra_price:=case
     when v_product.adicionais and v_extra='Bacon Extra' then 4
     when v_product.adicionais and v_extra in ('Cheddar','Catupiry','Calabresa') then 3
     when v_product.adicionais and v_extra='Hambúrguer Extra' then 5
     when v_product.adicionais and v_extra='Ovo' then 2
     when lower(v_product.nome) like '%espetinho%' and v_extra in ('Mandioca','Farofa') then 2
     when lower(v_product.nome) like '%espetinho%' and v_extra='Banana' then 3
     else null end;
    if v_extra_price is null then raise exception 'Adicional inválido'; end if;
    v_price:=v_price+v_extra_price;
   end loop;
  end if;
  if round((v_item->>'preco')::numeric,2) is distinct from round(v_price,2) then
   raise exception 'O preço de um item mudou. Atualize o carrinho e tente novamente.';
  end if;
  v_total:=v_total+v_price*v_qty;
  v_items:=v_items||jsonb_build_array(jsonb_build_object('nome',v_name,'preco',v_price,'quantidade',v_qty,'obs',coalesce(v_item->>'obs','')));
 end loop;
 v_expected:=v_total+case when v_type='entrega' then 4 else 0 end;
 if round((p_pedido->>'total')::numeric,2) is distinct from round(v_expected,2) then raise exception 'Total do pedido inválido'; end if;
 insert into public.pedidos(cliente_nome,cliente_telefone,itens,endereco,referencia,forma_pagamento,total,status,tipo_pedido,pago)
 values(btrim(p_pedido->>'cliente_nome'),p_pedido->>'cliente_telefone',v_items,p_pedido->>'endereco',p_pedido->>'referencia',p_pedido->>'forma_pagamento',v_expected,1,v_type,false)
 returning id into v_id;
 return jsonb_build_object('id',v_id,'total',v_expected);
end $$;
revoke all on function public.caldo_criar_pedido(jsonb) from public;
grant execute on function public.caldo_criar_pedido(jsonb) to anon,authenticated,service_role;
