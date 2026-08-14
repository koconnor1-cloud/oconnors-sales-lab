-- Fall 2026 launch readiness: free practice must not persist recordings.
-- The browser may use microphone audio transiently for transcription during practice,
-- but durable recording storage is permitted only for instructor-assigned sessions.

-- Replace the earlier broad student recording-metadata policy.
drop policy if exists "Students manage own recording metadata" on public.session_recordings;
drop policy if exists "Students upload own session recordings" on storage.objects;

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

-- Students may still read their own historical recording metadata.
drop policy if exists "Students read own recording metadata" on public.session_recordings;
create policy "Students read own recording metadata"
on public.session_recordings for select to authenticated
using (student_id=(select auth.uid()));

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

-- Existing read policies remain in place: students can read their own objects and
-- instructors can read objects for students in their class.
