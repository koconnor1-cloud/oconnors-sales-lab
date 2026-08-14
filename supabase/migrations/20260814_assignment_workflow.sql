-- Fall 2026 launch readiness: real instructor assignment workflow.
-- Provides authenticated, class-scoped RPCs for creating, publishing, and retiring
-- Sales Lab assignments. The browser should call these functions instead of
-- displaying prototype success toasts.

create or replace function public.create_sales_lab_assignment(
  p_title text,
  p_scenario text,
  p_character_id text,
  p_product text,
  p_difficulty text default 'Beginner',
  p_due_date date default null,
  p_instructions text default null,
  p_attempts_allowed integer default 3,
  p_assigned_to uuid default null,
  p_publish boolean default true
)
returns public.assignments
language plpgsql security definer set search_path=''
as $function$
declare
  v_teacher public.profiles%rowtype;
  v_assignment public.assignments%rowtype;
begin
  select * into v_teacher
  from public.profiles
  where id=(select auth.uid()) and role='teacher';
  if v_teacher.id is null then raise exception 'Only instructors can create assignments'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Assignment title is required'; end if;
  if nullif(trim(p_scenario),'') is null then raise exception 'Scenario is required'; end if;
  if p_attempts_allowed < 1 then raise exception 'Attempts allowed must be at least 1'; end if;

  if p_assigned_to is not null and not exists (
    select 1 from public.profiles s
    where s.id=p_assigned_to and s.role='student' and s.class_code=v_teacher.class_code
  ) then raise exception 'Assigned student is not in your class'; end if;

  insert into public.assignments(
    teacher_id,class_code,assigned_to,title,scenario,character_id,product,difficulty,
    due_date,instructions,attempts_allowed,published,active
  ) values (
    v_teacher.id,v_teacher.class_code,p_assigned_to,trim(p_title),p_scenario,p_character_id,
    p_product,coalesce(nullif(trim(p_difficulty),''),'Beginner'),p_due_date,
    nullif(trim(p_instructions),''),p_attempts_allowed,p_publish,true
  ) returning * into v_assignment;

  return v_assignment;
end;
$function$;

create or replace function public.set_sales_lab_assignment_published(
  p_assignment_id uuid,
  p_published boolean
)
returns public.assignments
language plpgsql security definer set search_path=''
as $function$
declare v_assignment public.assignments%rowtype;
begin
  update public.assignments a
  set published=p_published
  where a.id=p_assignment_id
    and a.teacher_id=(select auth.uid())
    and a.class_code=public.current_sales_lab_class()
  returning * into v_assignment;
  if v_assignment.id is null then raise exception 'Assignment not found or not authorized'; end if;
  return v_assignment;
end;
$function$;

create or replace function public.retire_sales_lab_assignment(p_assignment_id uuid)
returns void
language plpgsql security definer set search_path=''
as $function$
begin
  update public.assignments a
  set active=false,published=false
  where a.id=p_assignment_id
    and a.teacher_id=(select auth.uid())
    and a.class_code=public.current_sales_lab_class();
  if not found then raise exception 'Assignment not found or not authorized'; end if;
end;
$function$;

revoke execute on function public.create_sales_lab_assignment(text,text,text,text,text,date,text,integer,uuid,boolean) from public,anon;
revoke execute on function public.set_sales_lab_assignment_published(uuid,boolean) from public,anon;
revoke execute on function public.retire_sales_lab_assignment(uuid) from public,anon;
grant execute on function public.create_sales_lab_assignment(text,text,text,text,text,date,text,integer,uuid,boolean) to authenticated;
grant execute on function public.set_sales_lab_assignment_published(uuid,boolean) to authenticated;
grant execute on function public.retire_sales_lab_assignment(uuid) to authenticated;
