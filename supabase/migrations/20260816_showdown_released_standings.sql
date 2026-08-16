-- Privacy-safe standings for Argo Sales Showdown rounds.
-- Students receive only the released round's rank/name/score/advancement data.
-- The instructor may preview standings before release.

create or replace function public.get_released_showdown_standings(p_round_id uuid)
returns table(
  rank integer,
  student_id uuid,
  full_name text,
  score integer,
  advanced boolean
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_round public.competition_rounds%rowtype;
  v_comp public.competitions%rowtype;
  v_viewer public.profiles%rowtype;
begin
  select * into v_viewer
  from public.profiles
  where id=(select auth.uid());

  select * into v_round
  from public.competition_rounds
  where id=p_round_id;

  if v_round.id is null then
    raise exception 'Round not found';
  end if;

  select * into v_comp
  from public.competitions
  where id=v_round.competition_id;

  if v_viewer.id is null or v_viewer.class_code is distinct from v_comp.class_code then
    raise exception 'Not authorized for this class';
  end if;

  if v_viewer.role <> 'teacher' and not v_round.results_released then
    raise exception 'Results have not been released';
  end if;

  if v_viewer.role='teacher' and v_comp.teacher_id is distinct from v_viewer.id then
    raise exception 'Not authorized for this competition';
  end if;

  return query
  select
    e.rank,
    e.student_id,
    p.full_name,
    e.score,
    e.advanced
  from public.competition_entries e
  join public.profiles p on p.id=e.student_id
  where e.round_id=p_round_id
  order by e.rank asc nulls last,e.score desc nulls last,e.submitted_at asc;
end;
$function$;

revoke execute on function public.get_released_showdown_standings(uuid) from public,anon;
grant execute on function public.get_released_showdown_standings(uuid) to authenticated;
