-- Mantiene el tablero y las tomas existentes. Agrega un segundo lugar y un
-- historial de comentarios, sin transferencias de turno ni reasignación automática.
begin;
alter table public.seguimiento add column if not exists tomado_por_2 text;
alter table public.seguimiento add column if not exists tomado_en_2 timestamptz;
alter table public.seguimiento add column if not exists revision bigint not null default 0;
alter table public.seguimiento add column if not exists ultimo_comentario text;
alter table public.seguimiento add column if not exists ultimo_comentario_por text;
alter table public.seguimiento add column if not exists ultimo_comentario_en timestamptz;

alter table public.seguimiento drop constraint if exists seguimiento_segundo_responsable_check;
alter table public.seguimiento add constraint seguimiento_segundo_responsable_check check (
  (tomado_por_2 is null) = (tomado_en_2 is null)
  and (tomado_por_2 is null or (tomado_por is not null
    and nullif(btrim(tomado_por_2), '') is not null
    and lower(btrim(tomado_por_2)) <> lower(btrim(tomado_por))))
);
create index if not exists seguimiento_tomado_por_2_idx on public.seguimiento(tomado_por_2);

create table if not exists public.seguimiento_comentarios (
  id uuid primary key default gen_random_uuid(),
  orden bigint generated always as identity unique,
  seguimiento_id uuid not null references public.seguimiento(id) on delete cascade,
  autor text not null,
  texto text not null,
  creado_en timestamptz not null default now(),
  tipo text not null default 'comentario' check (tipo in ('comentario', 'creacion', 'correccion', 'legado')),
  solicitud_id uuid,
  anterior text,
  unique (seguimiento_id, solicitud_id)
);
create index if not exists seguimiento_comentarios_caso_idx
  on public.seguimiento_comentarios(seguimiento_id, creado_en desc, id desc);
create unique index if not exists seguimiento_comentarios_inicial_idx
  on public.seguimiento_comentarios(seguimiento_id) where tipo in ('creacion', 'legado');
alter table public.seguimiento_comentarios enable row level security;

insert into public.seguimiento_comentarios(seguimiento_id,autor,texto,creado_en,tipo)
select id,coalesce(comentario_actualizado_por,creado_por),comentario_original,
  coalesce(comentario_actualizado_en,created_at),'legado' from public.seguimiento
on conflict do nothing;

create or replace function public.seguimiento_incrementar_revision()
returns trigger language plpgsql set search_path=public as $$
begin new.revision := old.revision + 1; return new; end;
$$;
drop trigger if exists seguimiento_antes_revision on public.seguimiento;
create trigger seguimiento_antes_revision before update on public.seguimiento
for each row execute function public.seguimiento_incrementar_revision();

-- El motivo sigue siendo editable, pero cada corrección conserva el texto anterior.
create or replace function public.seguimiento_auditar_comentario()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.seguimiento_comentarios(seguimiento_id,autor,texto,tipo)
    values(new.id,new.creado_por,new.comentario_original,'creacion');
  elsif new.comentario_original is distinct from old.comentario_original then
    insert into public.seguimiento_comentarios(seguimiento_id,autor,texto,tipo,anterior)
    values(new.id,coalesce(new.comentario_actualizado_por,'administración'),new.comentario_original,'correccion',old.comentario_original);
  end if;
  return new;
end;
$$;
drop trigger if exists seguimiento_despues_comentario on public.seguimiento;
create trigger seguimiento_despues_comentario after insert or update on public.seguimiento
for each row execute function public.seguimiento_auditar_comentario();

create or replace function public.seguimiento_tomar_doble(
  p_id uuid,p_actor text,p_tomar boolean,p_objetivo text default null,p_admin boolean default false
) returns jsonb language plpgsql set search_path=public as $$
declare actual public.seguimiento%rowtype; objetivo text;
begin
  p_actor := lower(btrim(p_actor));
  objetivo := coalesce(nullif(lower(btrim(p_objetivo)),''),p_actor);
  if coalesce(length(p_actor),0)=0 or length(p_actor)>320 or p_tomar is null then
    return jsonb_build_object('ok',false,'error','Solicitud inválida.');
  end if;
  if objetivo <> p_actor and (p_tomar or not coalesce(p_admin,false)) then
    return jsonb_build_object('ok',false,'error','Solo podés quitarte a vos mismo; retirar a otra persona requiere un administrador.');
  end if;
  select * into actual from public.seguimiento where id=p_id for update;
  if not found then return jsonb_build_object('ok',false,'error','Ese reporte ya no está.'); end if;
  if p_tomar then
    if actual.estado <> 'abierto' then return jsonb_build_object('ok',false,'error','El reporte ya está cerrado.'); end if;
    if lower(actual.tomado_por)=p_actor or lower(actual.tomado_por_2)=p_actor then return jsonb_build_object('ok',true); end if;
    if actual.tomado_por is null then
      update public.seguimiento set tomado_por=p_actor,tomado_en=clock_timestamp() where id=p_id;
    elsif actual.tomado_por_2 is null then
      update public.seguimiento set tomado_por_2=p_actor,tomado_en_2=clock_timestamp() where id=p_id;
    else
      return jsonb_build_object('ok',false,'error','El caso ya tiene dos responsables. No se reemplazó a nadie.');
    end if;
  elsif lower(actual.tomado_por)=objetivo then
    -- Si sale la primera persona, la segunda conserva su toma y su fecha.
    update public.seguimiento set tomado_por=tomado_por_2,tomado_en=tomado_en_2,tomado_por_2=null,tomado_en_2=null where id=p_id;
  elsif lower(actual.tomado_por_2)=objetivo then
    update public.seguimiento set tomado_por_2=null,tomado_en_2=null where id=p_id;
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.seguimiento_agregar_comentario(p_id uuid,p_actor text,p_texto text,p_solicitud uuid)
returns jsonb language plpgsql set search_path=public as $$
declare actual public.seguimiento%rowtype; anterior public.seguimiento_comentarios%rowtype; momento timestamptz:=clock_timestamp();
begin
  p_actor:=lower(btrim(p_actor)); p_texto:=btrim(p_texto);
  if coalesce(length(p_actor),0)=0 or length(p_actor)>320 or coalesce(length(p_texto),0)=0 or length(p_texto)>4000 or p_solicitud is null then
    return jsonb_build_object('ok',false,'error','Escribí un comentario de hasta 4.000 caracteres.');
  end if;
  select * into actual from public.seguimiento where id=p_id for update;
  if not found then return jsonb_build_object('ok',false,'error','Ese reporte ya no está.'); end if;
  select * into anterior from public.seguimiento_comentarios where seguimiento_id=p_id and solicitud_id=p_solicitud;
  if found then
    if anterior.autor=p_actor and anterior.texto=p_texto then return jsonb_build_object('ok',true,'repetida',true); end if;
    return jsonb_build_object('ok',false,'error','No se puede reutilizar esa solicitud.');
  end if;
  if actual.estado <> 'abierto' then return jsonb_build_object('ok',false,'error','El caso está cerrado. Reabrilo antes de agregar comentarios.'); end if;
  insert into public.seguimiento_comentarios(seguimiento_id,autor,texto,creado_en,solicitud_id)
  values(p_id,p_actor,p_texto,momento,p_solicitud);
  update public.seguimiento set ultimo_comentario=p_texto,ultimo_comentario_por=p_actor,ultimo_comentario_en=momento where id=p_id;
  return jsonb_build_object('ok',true,'repetida',false);
end;
$$;

revoke all on public.seguimiento_comentarios from public,anon,authenticated;
revoke update,delete on public.seguimiento_comentarios from service_role;
grant select,insert on public.seguimiento_comentarios to service_role;
revoke all on sequence public.seguimiento_comentarios_orden_seq from public,anon,authenticated;
grant usage,select on sequence public.seguimiento_comentarios_orden_seq to service_role;
revoke all on function public.seguimiento_incrementar_revision(),public.seguimiento_auditar_comentario(),
  public.seguimiento_tomar_doble(uuid,text,boolean,text,boolean),public.seguimiento_agregar_comentario(uuid,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.seguimiento_tomar_doble(uuid,text,boolean,text,boolean),
  public.seguimiento_agregar_comentario(uuid,text,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
