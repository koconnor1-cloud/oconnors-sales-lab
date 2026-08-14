-- Fall 2026 grade-integrity hardening.
-- Official grade actions must apply only to assignment-linked sessions owned by
-- the signed-in instructor. Free practice and Showdown sessions are never gradable here.

create or replace function public.approve_session_grade(
  p_session_id uuid,
  p_final_grade integer,
  p_instructor_feedback text default null
)
returns public.sessions
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_session public.sessions%rowtype;
begin
  if p_final_grade not between 0 and 100 then
    raise exception 'Grade must be between 0 and 100';
  end if;

  select s.* into v_session
  from public.sessions s
  join public.assignments a on a.id=s.assignment_id
  join public.profiles student on student.id=s.student_id
  join public.profiles teacher on teacher.id=(select auth.uid())
  where s.id=p_session_id
    and teacher.role='teacher'
    and a.teacher_id=teacher.id
    and a.class_code=teacher.class_code
    and student.class_code=teacher.class_code
    and s.grading_status in ('awaiting_instructor','returned');

  if v_session.id is null then
    raise exception 'Assignment session not found, not authorized, or not reviewable';
  end if;

  update public.sessions
  set final_grade=p_final_grade,
      instructor_feedback=nullif(trim(p_instructor_feedback),''),
      grading_status='approved',
      reviewed_by=(select auth.uid()),
      reviewed_at=now()
  where id=p_session_id
  returning * into v_session;

  return v_session;
end;
$function$;

create or replace function public.return_session_for_review(
  p_session_id uuid,
  p_instructor_feedback text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  if nullif(trim(p_instructor_feedback),'') is null then
    raise exception 'Instructor feedback is required when returning a session';
  end if;

  if not exists (
    select 1
    from public.sessions s
    join public.assignments a on a.id=s.assignment_id
    join public.profiles student on student.id=s.student_id
    join public.profiles teacher on teacher.id=(select auth.uid())
    where s.id=p_session_id
      and teacher.role='teacher'
      and a.teacher_id=teacher.id
      and a.class_code=teacher.class_code
      and student.class_code=teacher.class_code
      and s.grading_status='awaiting_instructor'
  ) then
    raise exception 'Assignment session not found, not authorized, or not returnable';
  end if;

  update public.sessions
  set grading_status='returned',
      instructor_feedback=trim(p_instructor_feedback),
      reviewed_by=(select auth.uid()),
      reviewed_at=now()
  where id=p_session_id;
end;
$function$;

revoke execute on function public.approve_session_grade(uuid,integer,text) from public,anon;
revoke execute on function public.return_session_for_review(uuid,text) from public,anon;
grant execute on function public.approve_session_grade(uuid,integer,text) to authenticated;
grant execute on function public.return_session_for_review(uuid,text) to authenticated;
