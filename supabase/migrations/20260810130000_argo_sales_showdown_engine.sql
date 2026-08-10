-- Replace the empty legacy single-round prototype schema, if present.
-- Refuse to proceed if legacy competition records exist so deployment cannot discard data.
do $compatibility$
begin
  if to_regclass('public.competitions') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='competitions' and column_name='title'
     ) then
    if exists (select 1 from public.competitions)
       or (to_regclass('public.competition_entries') is not null and exists (select 1 from public.competition_entries)) then
      raise exception 'Legacy competition data exists; migrate it before installing the Showdown engine';
    end if;
    drop table if exists public.competition_entries cascade;
    drop table public.competitions cascade;
  end if;
end;
$compatibility$;

-- Operational Argo Sales Showdown: four rounds, official entries, standings, and advancement.

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  class_code text not null,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Argo Sales Showdown',
  status text not null default 'draft' check (status in ('draft','active','complete')),
  current_round integer not null default 0 check (current_round between 0 and 4),
  champion_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(class_code, title)
);

create table if not exists public.competition_rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 4),
  name text not null,
  scenario text not null,
  character_id text not null,
  product text not null,
  difficulty text not null,
  advance_count integer not null check (advance_count > 0),
  status text not null default 'locked' check (status in ('locked','open','closed')),
  results_released boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  unique(competition_id, round_number)
);

create table if not exists public.competition_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  score integer check (score between 0 and 100),
  rank integer check (rank > 0),
  advanced boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique(round_id, student_id)
);

create index if not exists competitions_class_idx on public.competitions(class_code);
create index if not exists competition_rounds_competition_idx on public.competition_rounds(competition_id, round_number);
create index if not exists competition_entries_round_score_idx on public.competition_entries(round_id, score desc, submitted_at);

alter table public.competitions enable row level security;
alter table public.competition_rounds enable row level security;
alter table public.competition_entries enable row level security;

create policy "Class members view competitions" on public.competitions for select to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.class_code=competitions.class_code));
create policy "Teachers manage own competitions" on public.competitions for all to authenticated
using (teacher_id=(select auth.uid()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher'))
with check (teacher_id=(select auth.uid()) and class_code=(select p.class_code from public.profiles p where p.id=(select auth.uid())) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher'));

create policy "Class members view competition rounds" on public.competition_rounds for select to authenticated
using (exists (select 1 from public.competitions c join public.profiles p on p.class_code=c.class_code where c.id=competition_rounds.competition_id and p.id=(select auth.uid())));
create policy "Teachers manage own competition rounds" on public.competition_rounds for all to authenticated
using (exists (select 1 from public.competitions c where c.id=competition_rounds.competition_id and c.teacher_id=(select auth.uid())))
with check (exists (select 1 from public.competitions c where c.id=competition_rounds.competition_id and c.teacher_id=(select auth.uid())));

create policy "Students view permitted competition entries" on public.competition_entries for select to authenticated
using (
  student_id=(select auth.uid()) or exists (
    select 1 from public.competition_rounds r join public.competitions c on c.id=r.competition_id
    where r.id=competition_entries.round_id and r.results_released
      and c.class_code=(select p.class_code from public.profiles p where p.id=(select auth.uid()))
  ) or exists (
    select 1 from public.competition_rounds r join public.competitions c on c.id=r.competition_id
    where r.id=competition_entries.round_id and c.teacher_id=(select auth.uid())
  )
);
create policy "Eligible students submit one official entry" on public.competition_entries for insert to authenticated
with check (
  student_id=(select auth.uid())
  and exists (select 1 from public.sessions s where s.id=session_id and s.student_id=(select auth.uid()))
  and exists (
    select 1 from public.competition_rounds r join public.competitions c on c.id=r.competition_id
    where r.id=round_id and r.status='open' and c.status='active' and c.class_code=(select p.class_code from public.profiles p where p.id=(select auth.uid()))
      and (
        r.round_number=1 or exists (
          select 1 from public.competition_rounds prior
          join public.competition_entries prior_entry on prior_entry.round_id=prior.id
          where prior.competition_id=r.competition_id and prior.round_number=r.round_number-1
            and prior_entry.student_id=(select auth.uid()) and prior_entry.advanced
        )
      )
  )
);
create policy "Teachers update class entries" on public.competition_entries for update to authenticated
using (exists (select 1 from public.competition_rounds r join public.competitions c on c.id=r.competition_id where r.id=competition_entries.round_id and c.teacher_id=(select auth.uid())))
with check (exists (select 1 from public.competition_rounds r join public.competitions c on c.id=r.competition_id where r.id=competition_entries.round_id and c.teacher_id=(select auth.uid())));

create or replace function public.create_argo_sales_showdown()
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_teacher public.profiles%rowtype; v_competition uuid;
begin
  select * into v_teacher from public.profiles where id=(select auth.uid()) and role='teacher';
  if v_teacher.id is null then raise exception 'Only instructors can create a Showdown'; end if;
  insert into public.competitions(class_code,teacher_id) values(v_teacher.class_code,v_teacher.id)
  on conflict(class_code,title) do update set teacher_id=excluded.teacher_id returning id into v_competition;
  insert into public.competition_rounds(competition_id,round_number,name,scenario,character_id,product,difficulty,advance_count)
  values
    (v_competition,1,'The Qualifier','cold','marcus','Social media marketing','Beginner',16),
    (v_competition,2,'The Challenge','objection','sandra','Office tech bundle','Intermediate',8),
    (v_competition,3,'The Semifinal','demo','derek','POS system','Intermediate',4),
    (v_competition,4,'The Championship','close','patricia','Business consulting','Advanced',1)
  on conflict(competition_id,round_number) do nothing;
  return v_competition;
end;
$function$;

create or replace function public.open_showdown_round(p_round_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_round public.competition_rounds%rowtype; v_comp public.competitions%rowtype;
begin
  select * into v_round from public.competition_rounds where id=p_round_id;
  select * into v_comp from public.competitions where id=v_round.competition_id;
  if v_comp.teacher_id is distinct from (select auth.uid()) then raise exception 'Not authorized'; end if;
  if v_round.round_number>1 and not exists(select 1 from public.competition_rounds where competition_id=v_comp.id and round_number=v_round.round_number-1 and status='closed') then raise exception 'Close the prior round first'; end if;
  if exists(select 1 from public.competition_rounds where competition_id=v_comp.id and status='open' and id<>p_round_id) then raise exception 'Close the current round first'; end if;
  update public.competition_rounds set status='open',opens_at=coalesce(opens_at,now()) where id=p_round_id;
  update public.competitions set status='active',current_round=v_round.round_number where id=v_comp.id;
end;
$function$;

create or replace function public.finalize_showdown_round(p_round_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_round public.competition_rounds%rowtype; v_comp public.competitions%rowtype; v_champion uuid;
begin
  select * into v_round from public.competition_rounds where id=p_round_id;
  select * into v_comp from public.competitions where id=v_round.competition_id;
  if v_comp.teacher_id is distinct from (select auth.uid()) then raise exception 'Not authorized'; end if;
  if v_round.status is distinct from 'open' then raise exception 'Only an open round can be finalized'; end if;
  if not exists(select 1 from public.competition_entries where round_id=p_round_id) then raise exception 'No official entries to rank'; end if;
  with ranked as (
    select id,cast(row_number() over(order by score desc nulls last,submitted_at asc) as integer) as place
    from public.competition_entries where round_id=p_round_id
  )
  update public.competition_entries e set rank=ranked.place,advanced=(ranked.place<=v_round.advance_count)
  from ranked where e.id=ranked.id;
  update public.competition_rounds set status='closed',closes_at=now() where id=p_round_id;
  if v_round.round_number=4 then
    select student_id into v_champion from public.competition_entries where round_id=p_round_id order by rank limit 1;
    update public.competitions set status='complete',champion_id=v_champion where id=v_comp.id;
  end if;
end;
$function$;

revoke execute on function public.create_argo_sales_showdown() from public,anon;
revoke execute on function public.open_showdown_round(uuid) from public,anon;
revoke execute on function public.finalize_showdown_round(uuid) from public,anon;
grant execute on function public.create_argo_sales_showdown() to authenticated;
grant execute on function public.open_showdown_round(uuid) to authenticated;
grant execute on function public.finalize_showdown_round(uuid) to authenticated;

grant select,insert,update on public.competitions,public.competition_rounds,public.competition_entries to authenticated;
