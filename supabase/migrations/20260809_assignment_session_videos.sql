create table if not exists public.session_videos (
 id uuid primary key default extensions.uuid_generate_v4(), session_id uuid not null unique references public.sessions(id) on delete cascade,
 assignment_id uuid not null references public.assignments(id) on delete cascade, student_id uuid not null references public.profiles(id) on delete cascade,
 storage_path text not null unique, mime_type text not null check (mime_type like 'video/%'), size_bytes bigint not null default 0 check(size_bytes>=0),
 duration_seconds integer not null default 0 check(duration_seconds>=0), consented_at timestamptz not null, created_at timestamptz not null default timezone('utc',now())
);
alter table public.session_videos enable row level security;
grant select,insert on public.session_videos to authenticated;
create index if not exists session_videos_student_idx on public.session_videos(student_id,created_at desc);
create index if not exists session_videos_assignment_idx on public.session_videos(assignment_id);
create policy "Students insert own assignment videos" on public.session_videos for insert to authenticated with check ((select auth.uid())=student_id and exists(select 1 from public.sessions s where s.id=session_videos.session_id and s.student_id=(select auth.uid()) and s.assignment_id=session_videos.assignment_id and s.assignment_id is not null));
create policy "Students view own assignment videos" on public.session_videos for select to authenticated using ((select auth.uid())=student_id);
create policy "Teachers view assigned session videos" on public.session_videos for select to authenticated using ((select private.current_profile_role())='teacher' and exists(select 1 from public.assignments a join public.sessions s on s.assignment_id=a.id where s.id=session_videos.session_id and a.id=session_videos.assignment_id and a.teacher_id=(select auth.uid()) and a.class_code=(select private.current_class_code())));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('assignment-videos','assignment-videos',false,157286400,array['video/webm','video/mp4','video/quicktime']::text[]) on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "Students upload own assignment videos" on storage.objects for insert to authenticated with check(bucket_id='assignment-videos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Students read own assignment videos" on storage.objects for select to authenticated using(bucket_id='assignment-videos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Teachers read assigned session videos" on storage.objects for select to authenticated using(bucket_id='assignment-videos' and (select private.current_profile_role())='teacher' and exists(select 1 from public.session_videos v join public.assignments a on a.id=v.assignment_id where v.storage_path=storage.objects.name and a.teacher_id=(select auth.uid()) and a.class_code=(select private.current_class_code())));
