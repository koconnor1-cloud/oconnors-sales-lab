-- Fall 2026 Showdown hardening.
-- Fixes recursive competition_entries RLS and tags the exact session created for
-- an official round so old/free-practice or wrong-scenario sessions cannot be submitted.

alter table public.sessions
  add column if not exists competition_round_id uuid references public.competition_rounds(id) on delete set null;

create index if not exists sessions_competition_round_student_idx
  on public.sessions(competition_round_id,student_id)
  where competition_round_id is not null;

alter table public.sessions
  drop constraint if exists sessions_grading_status_check;
alter table public.sessions
  add constraint sessions_grading_status_check check (
    grading_status in ('practice_feedback','awaiting_instructor','approved','returned','competition_evidence')
  );

create or replace function public.protect_official_grade_fields()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if (select private.current_profile_role())='student' then
    if tg_op='INSERT' then
      new.final_grade:=null;
      new.instructor_feedback:=null;
      new.reviewed_by:=null;
      new.reviewed_at:=null;
      new.grading_status:=case
        when new.assignment_id is not null then 'awaiting_instructor'
        when new.competition_round_id is not null then 'competition_evidence'
        else 'practice_feedback'
      end;
    else
      new.final_grade:=old.final_grade;
      new.instructor_feedback:=old.instructor_feedback;
      new.reviewed_by:=old.reviewed_by;
      new.reviewed_at:=old.reviewed_at;
      new.grading_status:=old.grading_status;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.showdown_entry_is_eligible(
  p_round_id uuid,
  p_student_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists(
    select 1
    from public.competition_rounds r
    join public.competitions c on c.id=r.competition_id
    join public.profiles p on p.id=p_student_id
    join public.sessions s on s.id=p_session_id
    where r.id=p_round_id
      and p.role='student'
      and c.class_code=p.class_code
      and r.status='open'
      and c.status='active'
      and r.opens_at is not null
      and s.student_id=p_student_id
      and s.assignment_id is null
      and s.competition_round_id=r.id
      and s.scenario=r.scenario
      and s.created_at>=r.opens_at
      and (
        r.round_number=1
        or exists(
          select 1
          from public.competition_rounds prior
          join public.competition_entries prior_entry on prior_entry.round_id=prior.id
          where prior.competition_id=r.competition_id
            and prior.round_number=r.round_number-1
            and prior_entry.student_id=p_student_id
            and prior_entry.advanced
        )
      )
  );
$function$;

revoke all on function private.showdown_entry_is_eligible(uuid,uuid,uuid) from public,anon;
grant execute on function private.showdown_entry_is_eligible(uuid,uuid,uuid) to authenticated;

drop policy if exists "Eligible students submit one official entry" on public.competition_entries;
create policy "Eligible students submit one official entry"
on public.competition_entries for insert to authenticated
with check (
  student_id=(select auth.uid())
  and private.showdown_entry_is_eligible(round_id,student_id,session_id)
);
