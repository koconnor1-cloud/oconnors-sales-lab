-- Fall 2026 launch hardening: enforce formal assignment eligibility and attempt limits.
-- This protects the rule at the database layer so browser changes or direct API
-- requests cannot create extra formal attempts.

create or replace function public.enforce_assignment_attempt_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment public.assignments%rowtype;
  v_student public.profiles%rowtype;
  v_attempts integer;
begin
  if new.assignment_id is null then
    return new;
  end if;

  if new.student_id is distinct from (select auth.uid()) then
    raise exception 'Formal assignment attempts must be submitted by the signed-in student';
  end if;

  select * into v_student
  from public.profiles
  where id=new.student_id and role='student';
  if v_student.id is null then
    raise exception 'Student profile not found';
  end if;

  select * into v_assignment
  from public.assignments
  where id=new.assignment_id
  for update;

  if v_assignment.id is null then
    raise exception 'Assignment not found';
  end if;
  if not v_assignment.active or not v_assignment.published then
    raise exception 'This assignment is not currently open for submission';
  end if;
  if v_assignment.class_code is distinct from v_student.class_code then
    raise exception 'Assignment is not in the student class';
  end if;
  if v_assignment.assigned_to is not null and v_assignment.assigned_to is distinct from new.student_id then
    raise exception 'Assignment is not assigned to this student';
  end if;
  if new.scenario is distinct from v_assignment.scenario then
    raise exception 'Submitted scenario does not match the assignment';
  end if;

  select count(*) into v_attempts
  from public.sessions s
  where s.student_id=new.student_id
    and s.assignment_id=new.assignment_id;

  if v_attempts >= greatest(coalesce(v_assignment.attempts_allowed,1),1) then
    raise exception 'No formal attempts remain for this assignment';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_assignment_attempt_guard() from public,anon,authenticated;

drop trigger if exists enforce_assignment_attempt_guard on public.sessions;
create trigger enforce_assignment_attempt_guard
before insert on public.sessions
for each row
when (new.assignment_id is not null)
execute function public.enforce_assignment_attempt_guard();
