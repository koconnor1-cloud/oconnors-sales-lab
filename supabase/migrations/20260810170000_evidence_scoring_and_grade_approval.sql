-- Evidence-based AI recommendations with instructor-controlled final grades.

alter table public.sessions
  add column if not exists scoring_version text,
  add column if not exists recommended_score integer check (recommended_score between 0 and 100),
  add column if not exists scoring_confidence numeric(4,3) check (scoring_confidence between 0 and 1),
  add column if not exists scoring_evidence jsonb,
  add column if not exists review_flags text[] not null default '{}',
  add column if not exists grading_status text not null default 'practice_feedback'
    check (grading_status in ('practice_feedback','awaiting_instructor','approved','returned')),
  add column if not exists final_grade integer check (final_grade between 0 and 100),
  add column if not exists instructor_feedback text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists sessions_instructor_review_idx
  on public.sessions (grading_status, created_at desc)
  where grading_status='awaiting_instructor';

-- Students may submit the recommendation produced by the protected AI proxy,
-- but only faculty can create or change an official grade and review record.
create or replace function public.protect_official_grade_fields()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if (select private.current_profile_role())='student' then
    if tg_op='INSERT' then
      new.final_grade:=null; new.instructor_feedback:=null; new.reviewed_by:=null; new.reviewed_at:=null;
      new.grading_status:=case when new.assignment_id is null then 'practice_feedback' else 'awaiting_instructor' end;
    else
      new.final_grade:=old.final_grade; new.instructor_feedback:=old.instructor_feedback;
      new.reviewed_by:=old.reviewed_by; new.reviewed_at:=old.reviewed_at; new.grading_status:=old.grading_status;
    end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists protect_official_grade_fields on public.sessions;
create trigger protect_official_grade_fields before insert or update on public.sessions
for each row execute function public.protect_official_grade_fields();
revoke execute on function public.protect_official_grade_fields() from public,anon,authenticated;

create or replace function public.approve_session_grade(
  p_session_id uuid,
  p_final_grade integer,
  p_instructor_feedback text default null
)
returns public.sessions
language plpgsql security definer set search_path=''
as $function$
declare v_session public.sessions%rowtype;
begin
  if p_final_grade not between 0 and 100 then raise exception 'Grade must be between 0 and 100'; end if;
  select s.* into v_session
  from public.sessions s
  join public.profiles student on student.id=s.student_id
  join public.profiles teacher on teacher.id=(select auth.uid())
  where s.id=p_session_id and teacher.role='teacher' and teacher.class_code=student.class_code;
  if v_session.id is null then raise exception 'Session not found or not authorized'; end if;
  update public.sessions set
    final_grade=p_final_grade,
    instructor_feedback=nullif(trim(p_instructor_feedback),''),
    grading_status='approved',
    reviewed_by=(select auth.uid()),
    reviewed_at=now()
  where id=p_session_id returning * into v_session;
  return v_session;
end;
$function$;

create or replace function public.return_session_for_review(
  p_session_id uuid,
  p_instructor_feedback text
)
returns void
language plpgsql security definer set search_path=''
as $function$
begin
  if not exists (
    select 1 from public.sessions s
    join public.profiles student on student.id=s.student_id
    join public.profiles teacher on teacher.id=(select auth.uid())
    where s.id=p_session_id and teacher.role='teacher' and teacher.class_code=student.class_code
  ) then raise exception 'Session not found or not authorized'; end if;
  update public.sessions set grading_status='returned', instructor_feedback=p_instructor_feedback,
    reviewed_by=(select auth.uid()), reviewed_at=now() where id=p_session_id;
end;
$function$;

revoke execute on function public.approve_session_grade(uuid,integer,text) from public,anon;
revoke execute on function public.return_session_for_review(uuid,text) from public,anon;
grant execute on function public.approve_session_grade(uuid,integer,text) to authenticated;
grant execute on function public.return_session_for_review(uuid,text) to authenticated;
