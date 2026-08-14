-- Fall 2026 reliability hardening: allow a student to recover from a failed
-- formal-assignment video upload without consuming the only allowed attempt.
-- Completed submissions, submissions with video metadata, and graded sessions
-- cannot be removed through this recovery path.

create or replace function public.discard_incomplete_assignment_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_student uuid := (select auth.uid());
  v_deleted uuid;
begin
  if v_student is null then
    raise exception 'Authentication required';
  end if;

  delete from public.sessions s
  where s.id=p_session_id
    and s.student_id=v_student
    and s.assignment_id is not null
    and s.final_grade is null
    and s.grading_status='awaiting_instructor'
    and not exists (
      select 1 from public.session_videos v where v.session_id=s.id
    )
  returning s.id into v_deleted;

  if v_deleted is null then
    raise exception 'Incomplete assignment session not found or cannot be discarded';
  end if;

  return true;
end;
$function$;

revoke execute on function public.discard_incomplete_assignment_session(uuid) from public,anon;
grant execute on function public.discard_incomplete_assignment_session(uuid) to authenticated;

-- If the binary upload succeeded but metadata creation failed, the student may
-- remove only a video object in their own assignment-video folder.
drop policy if exists "Students delete own incomplete assignment videos" on storage.objects;
create policy "Students delete own incomplete assignment videos"
on storage.objects for delete to authenticated
using (
  bucket_id='assignment-videos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1
    from public.sessions s
    where s.student_id=(select auth.uid())
      and s.assignment_id is not null
      and s.id::text=(storage.foldername(name))[2]
      and s.final_grade is null
      and s.grading_status='awaiting_instructor'
      and not exists (
        select 1 from public.session_videos v where v.session_id=s.id
      )
  )
);
