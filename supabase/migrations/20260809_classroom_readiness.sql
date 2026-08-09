-- Classroom readiness security and assignment tracking.
-- Apply through Supabase after explicit production authorization.

alter table public.assignments
  add column if not exists title text,
  add column if not exists attempts_allowed integer not null default 3 check (attempts_allowed > 0),
  add column if not exists published boolean not null default false;

alter table public.sessions
  add column if not exists assignment_id uuid references public.assignments(id) on delete set null;

create index if not exists sessions_assignment_student_idx on public.sessions (assignment_id, student_id, created_at desc);
create index if not exists sessions_student_idx on public.sessions (student_id, created_at desc);
create index if not exists assignments_teacher_idx on public.assignments (teacher_id);
create index if not exists assignments_assigned_to_idx on public.assignments (assigned_to);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  insert into public.profiles (id,email,full_name,role,class_code)
  values (new.id,new.email,new.raw_user_meta_data->>'full_name','student',
    coalesce(nullif(upper(new.raw_user_meta_data->>'class_code'),''),'SALES24'));
  return new;
end;
$function$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users update safe own profile" on public.profiles
for update to authenticated
using ((select auth.uid())=id)
with check (
  (select auth.uid())=id
  and role=(select p.role from public.profiles p where p.id=(select auth.uid()))
  and class_code=(select p.class_code from public.profiles p where p.id=(select auth.uid()))
);

drop policy if exists "Anyone can view assignments for their class" on public.assignments;
drop policy if exists "Teachers can manage assignments" on public.assignments;
create policy "Students view published class assignments" on public.assignments
for select to authenticated
using (
  published and active and (assigned_to is null or assigned_to=(select auth.uid()))
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='student' and p.class_code=assignments.class_code)
);
create policy "Teachers manage own class assignments" on public.assignments
for all to authenticated
using (
  teacher_id=(select auth.uid())
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher' and p.class_code=assignments.class_code)
)
with check (
  teacher_id=(select auth.uid())
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='teacher' and p.class_code=assignments.class_code)
);

drop policy if exists "Teachers can view all sessions" on public.sessions;
create policy "Teachers view own class sessions" on public.sessions
for select to authenticated
using (
  exists (
    select 1 from public.profiles teacher
    join public.profiles student on student.id=sessions.student_id
    where teacher.id=(select auth.uid()) and teacher.role='teacher' and teacher.class_code=student.class_code
  )
);

create or replace function public.get_leaderboard(p_class_code text,p_scenario text default null)
returns table(student_id uuid,full_name text,best_score integer,session_count bigint,total_time integer,top_skill text)
language plpgsql security definer set search_path=''
as $function$
begin
  if not exists (
    select 1 from public.profiles viewer
    where viewer.id=(select auth.uid()) and viewer.class_code=p_class_code
  ) then raise exception 'Not authorized for this class'; end if;
  return query
  select p.id,p.full_name,max(s.overall_score),count(s.id),p.total_practice_time,
    case when avg(s.rapport)>=7 then 'Rapport' when avg(s.value_prop)>=7 then 'Value prop'
         when avg(s.clarity)>=7 then 'Clarity' else 'Improving' end
  from public.profiles p
  left join public.sessions s on s.student_id=p.id and (p_scenario is null or s.scenario=p_scenario)
  where p.class_code=p_class_code and p.role='student'
  group by p.id,p.full_name,p.total_practice_time
  order by max(s.overall_score) desc nulls last;
end;
$function$;
revoke execute on function public.get_leaderboard(text,text) from public, anon;
grant execute on function public.get_leaderboard(text,text) to authenticated;
