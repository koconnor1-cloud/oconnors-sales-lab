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
    coalesce(nullif(upper(new.raw_user_meta_data->>'class_code'),''),'SALESFALL26'));
  return new;
end;
$function$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create or replace function public.current_sales_lab_role()
returns text language sql stable security definer set search_path=''
as $$ select role from public.profiles where id=(select auth.uid()) $$;
create or replace function public.current_sales_lab_class()
returns text language sql stable security definer set search_path=''
as $$ select class_code from public.profiles where id=(select auth.uid()) $$;
revoke execute on function public.current_sales_lab_role() from public, anon;
revoke execute on function public.current_sales_lab_class() from public, anon;
grant execute on function public.current_sales_lab_role() to authenticated;
grant execute on function public.current_sales_lab_class() to authenticated;
create policy "Users update safe own profile" on public.profiles
for update to authenticated
using ((select auth.uid())=id)
with check (
  (select auth.uid())=id
  and role=public.current_sales_lab_role()
  and class_code=public.current_sales_lab_class()
);

create table if not exists public.session_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  response_index integer not null check (response_index > 0),
  recorded_at_seconds integer not null default 0,
  mime_type text,
  created_at timestamptz not null default now(),
  unique(session_id,response_index)
);
alter table public.session_recordings enable row level security;
create policy "Students manage own recording metadata" on public.session_recordings for all to authenticated
using (student_id=(select auth.uid())) with check (student_id=(select auth.uid()));
create policy "Teachers view class recording metadata" on public.session_recordings for select to authenticated
using (public.current_sales_lab_role()='teacher' and exists (
  select 1 from public.profiles student where student.id=session_recordings.student_id and student.class_code=public.current_sales_lab_class()
));

insert into storage.buckets (id,name,public) values ('session-recordings','session-recordings',false)
on conflict (id) do update set public=false;
create policy "Students upload own session recordings" on storage.objects for insert to authenticated
with check (bucket_id='session-recordings' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Students read own session recordings" on storage.objects for select to authenticated
using (bucket_id='session-recordings' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Teachers read class session recordings" on storage.objects for select to authenticated
using (bucket_id='session-recordings' and public.current_sales_lab_role()='teacher' and exists (
  select 1 from public.profiles student where student.id::text=(storage.foldername(name))[1] and student.class_code=public.current_sales_lab_class()
));

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
