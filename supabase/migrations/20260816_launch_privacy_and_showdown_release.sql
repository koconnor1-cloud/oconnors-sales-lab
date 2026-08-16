-- Fall 2026 launch hardening.
-- 1) The legacy class leaderboard is instructor-only until the instructor explicitly
--    releases competition results through the Showdown workflow.
-- 2) Add an instructor-owned RPC for releasing or hiding results for a closed round.

create or replace function public.get_leaderboard(
  p_class_code text,
  p_scenario text default null
)
returns table(
  student_id uuid,
  full_name text,
  best_score integer,
  session_count bigint,
  total_time integer,
  top_skill text
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not exists (
    select 1
    from public.profiles viewer
    where viewer.id=(select auth.uid())
      and viewer.role='teacher'
      and viewer.class_code=p_class_code
  ) then
    raise exception 'Only the instructor for this class may view the private class leaderboard';
  end if;

  return query
  select
    p.id,
    p.full_name,
    max(s.overall_score),
    count(s.id),
    p.total_practice_time,
    case
      when avg(s.rapport)>=7 then 'Rapport'
      when avg(s.value_prop)>=7 then 'Value prop'
      when avg(s.clarity)>=7 then 'Clarity'
      else 'Improving'
    end
  from public.profiles p
  left join public.sessions s
    on s.student_id=p.id
   and (p_scenario is null or s.scenario=p_scenario)
  where p.class_code=p_class_code
    and p.role='student'
  group by p.id,p.full_name,p.total_practice_time
  order by max(s.overall_score) desc nulls last;
end;
$function$;

revoke execute on function public.get_leaderboard(text,text) from public,anon;
grant execute on function public.get_leaderboard(text,text) to authenticated;

create or replace function public.set_showdown_results_released(
  p_round_id uuid,
  p_released boolean
)
returns public.competition_rounds
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_round public.competition_rounds%rowtype;
  v_teacher uuid := (select auth.uid());
begin
  select r.* into v_round
  from public.competition_rounds r
  join public.competitions c on c.id=r.competition_id
  join public.profiles teacher on teacher.id=v_teacher
  where r.id=p_round_id
    and c.teacher_id=v_teacher
    and teacher.role='teacher'
    and teacher.class_code=c.class_code;

  if v_round.id is null then
    raise exception 'Round not found or not authorized';
  end if;

  if p_released and v_round.status <> 'closed' then
    raise exception 'Close and rank the round before releasing results';
  end if;

  update public.competition_rounds
  set results_released=p_released
  where id=p_round_id
  returning * into v_round;

  return v_round;
end;
$function$;

revoke execute on function public.set_showdown_results_released(uuid,boolean) from public,anon;
grant execute on function public.set_showdown_results_released(uuid,boolean) to authenticated;
