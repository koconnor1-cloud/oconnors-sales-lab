-- Fall 2026 launch readiness: free practice must not persist recordings.
-- Microphone audio may be used transiently for transcription during free practice,
-- but durable recording storage is permitted only for instructor-assigned sessions.

-- Remove the current broad metadata policy and replace it with assignment-only insert
-- plus student-owned read/delete access.
drop policy if exists "Students manage own recordings" on public.session_recordings;
drop policy if exists "Students manage own recording metadata" on public.session_recordings;
drop policy if exists "Students save assigned recording metadata" on public.session_recordings;
drop policy if exists "Students read own recording metadata" on public.session_recordings;

create policy "Students save assigned recording metadata"
on public.session_recordings for insert to authenticated
with check (
  student_id=(select auth.uid())
  and exists (
    select 1 from public.sessions s
    where s.id=session_recordings.session_id
      and s.student_id=(select auth.uid())
      and s.assignment_id is not null
  )
);

create policy "Students read own recording metadata"
on public.session_recordings for select to authenticated
using (student_id=(select auth.uid()));

create policy "Students delete own recording metadata"
on public.session_recordings for delete to authenticated
using (student_id=(select auth.uid()));

-- Remove the current broad storage upload policy. Read/delete policies remain valid.
drop policy if exists "Students upload own session audio" on storage.objects;
drop policy if exists "Students upload own session recordings" on storage.objects;
drop policy if exists "Students upload assigned session recordings" on storage.objects;

create policy "Students upload assigned session recordings"
on storage.objects for insert to authenticated
with check (
  bucket_id='session-recordings'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.sessions s
    where s.student_id=(select auth.uid())
      and s.assignment_id is not null
      and s.id::text=(storage.foldername(name))[2]
  )
);

-- Existing student read/delete and instructor class-scoped read policies are preserved.
