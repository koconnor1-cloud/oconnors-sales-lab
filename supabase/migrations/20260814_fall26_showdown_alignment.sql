-- Fall 2026 course alignment for the Argo Sales Showdown.
-- Expands the original four-round engine to the finalized five-stage progression:
-- Cold Call -> Discovery -> Value Presentation -> Objection + Value -> Integrated Championship.
-- Do not apply until the matching browser scenario support is deployed.

alter table public.competitions
  drop constraint if exists competitions_current_round_check;
alter table public.competitions
  add constraint competitions_current_round_check check (current_round between 0 and 5);

alter table public.competition_rounds
  drop constraint if exists competition_rounds_round_number_check;
alter table public.competition_rounds
  add constraint competition_rounds_round_number_check check (round_number between 1 and 5);

create or replace function public.create_argo_sales_showdown()
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_teacher public.profiles%rowtype;
  v_competition uuid;
  v_has_entries boolean;
begin
  select * into v_teacher from public.profiles
  where id=(select auth.uid()) and role='teacher';
  if v_teacher.id is null then raise exception 'Only instructors can create a Showdown'; end if;

  insert into public.competitions(class_code,teacher_id,title)
  values(v_teacher.class_code,v_teacher.id,'Argo Sales Showdown')
  on conflict(class_code,title) do update set teacher_id=excluded.teacher_id
  returning id into v_competition;

  select exists(
    select 1 from public.competition_entries e
    join public.competition_rounds r on r.id=e.round_id
    where r.competition_id=v_competition
  ) into v_has_entries;

  if v_has_entries then
    raise exception 'Showdown entries already exist. Do not rewrite the competition structure after official attempts begin.';
  end if;

  delete from public.competition_rounds where competition_id=v_competition;

  insert into public.competition_rounds(
    competition_id,round_number,name,scenario,character_id,product,difficulty,advance_count,status,results_released
  ) values
    (v_competition,1,'Round 1 — Cold Call','cold','marcus','B2B service solution','Beginner',16,'locked',false),
    (v_competition,2,'Round 2 — Discovery','discovery','sandra','Operational improvement solution','Intermediate',8,'locked',false),
    (v_competition,3,'Quarterfinal — Value Presentation','presentation','derek','Business technology solution','Intermediate',4,'locked',false),
    (v_competition,4,'Semifinal — Objection Handling + Value','objection','patricia','Business investment proposal','Advanced',2,'locked',false),
    (v_competition,5,'Championship — Complete Sales Call + Close','integrated','patricia','Integrated B2B solution','Advanced',1,'locked',false);

  update public.competitions
  set status='draft',current_round=0,champion_id=null
  where id=v_competition;

  return v_competition;
end;
$function$;

create or replace function public.finalize_showdown_round(p_round_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare
  v_round public.competition_rounds%rowtype;
  v_comp public.competitions%rowtype;
  v_champion uuid;
begin
  select * into v_round from public.competition_rounds where id=p_round_id;
  select * into v_comp from public.competitions where id=v_round.competition_id;
  if v_comp.teacher_id is distinct from (select auth.uid()) then raise exception 'Not authorized'; end if;
  if v_round.status is distinct from 'open' then raise exception 'Only an open round can be finalized'; end if;
  if not exists(select 1 from public.competition_entries where round_id=p_round_id) then
    raise exception 'No official entries to rank';
  end if;

  with ranked as (
    select id,cast(row_number() over(order by score desc nulls last,submitted_at asc) as integer) as place
    from public.competition_entries where round_id=p_round_id
  )
  update public.competition_entries e
  set rank=ranked.place,advanced=(ranked.place<=v_round.advance_count)
  from ranked where e.id=ranked.id;

  update public.competition_rounds set status='closed',closes_at=now() where id=p_round_id;

  if v_round.round_number=5 then
    select student_id into v_champion
    from public.competition_entries where round_id=p_round_id order by rank limit 1;
    update public.competitions
    set status='complete',champion_id=v_champion,current_round=5
    where id=v_comp.id;
  end if;
end;
$function$;

revoke execute on function public.create_argo_sales_showdown() from public,anon;
revoke execute on function public.finalize_showdown_round(uuid) from public,anon;
grant execute on function public.create_argo_sales_showdown() to authenticated;
grant execute on function public.finalize_showdown_round(uuid) to authenticated;
