CREATE OR REPLACE FUNCTION public.submit_showdown_entry(p_round_id uuid, p_session_id uuid)
 RETURNS competition_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_student public.profiles%rowtype;
  v_round public.competition_rounds%rowtype;
  v_comp public.competitions%rowtype;
  v_session public.sessions%rowtype;
  v_existing public.competition_entries%rowtype;
  v_entry public.competition_entries%rowtype;
  v_score integer;
  v_championship_eligible boolean;
  v_score_source text;
begin
  select * into v_student from public.profiles
  where id=(select auth.uid()) and role='student';
  if v_student.id is null then raise exception 'Student profile not found'; end if;

  select * into v_round from public.competition_rounds where id=p_round_id for update;
  if v_round.id is null then raise exception 'Showdown round not found'; end if;

  select * into v_comp from public.competitions where id=v_round.competition_id;
  if v_comp.id is null or v_comp.class_code is distinct from v_student.class_code then
    raise exception 'Showdown round is not available for this class';
  end if;

  if not exists(
    select 1 from public.competition_participants cp
    where cp.competition_id=v_comp.id and cp.student_id=v_student.id and cp.active
  ) then
    raise exception 'This account is not on the official Showdown roster';
  end if;

  if v_comp.status<>'active' or v_round.status<>'open' or v_round.opens_at is null then
    raise exception 'This Showdown round is not open';
  end if;
  if v_round.planned_open_at is not null and now()<v_round.planned_open_at then
    raise exception 'This Showdown round has not opened yet';
  end if;
  if v_round.planned_close_at is not null and now()>v_round.planned_close_at then
    raise exception 'The submission window for this Showdown round has closed';
  end if;

  select * into v_session from public.sessions where id=p_session_id;
  if v_session.id is null or v_session.student_id is distinct from v_student.id then
    raise exception 'Showdown session not found for the signed-in student';
  end if;

  if v_session.assignment_id is not null
     or v_session.competition_round_id is distinct from v_round.id
     or v_session.scenario is distinct from v_round.scenario
     or v_session.character_id is distinct from v_round.character_id
     or v_session.product is distinct from v_round.product
     or v_session.created_at<v_round.opens_at then
    raise exception 'Saved session does not match this Showdown round';
  end if;

  select * into v_existing from public.competition_entries
  where round_id=v_round.id and student_id=v_student.id;
  if v_existing.id is not null then
    if v_existing.session_id=v_session.id then return v_existing; end if;
    if v_round.id<>'1d9a6b0d-d6be-4ef4-b1c8-5dab930eff03'::uuid then
      raise exception 'Official entry already submitted for this Showdown round';
    end if;
    if v_session.created_at <= (select created_at from public.sessions where id=v_existing.session_id) then
      raise exception 'A newer official recording is already submitted';
    end if;
  end if;

  -- Round 2 is promoted only after the private recording and metadata exist.
  if v_round.id='1d9a6b0d-d6be-4ef4-b1c8-5dab930eff03'::uuid and not exists (
    select 1 from public.session_videos v join storage.objects o
      on o.bucket_id='assignment-videos' and o.name=v.storage_path
    where v.session_id=v_session.id and v.student_id=v_student.id
      and v.competition_round_id=v_round.id and v.size_bytes>0
      and v.consented_at is not null
  ) then raise exception 'Recording upload must finish before submitting Round 2'; end if;

  v_score:=coalesce(v_session.recommended_score,v_session.overall_score);
  if v_score is null or v_score<0 or v_score>100 then
    raise exception 'Saved Showdown score is invalid';
  end if;

  v_championship_eligible := (
    v_round.round_number=1
    or exists(
      select 1
      from public.competition_rounds prior
      join public.competition_entries pe on pe.round_id=prior.id
      where prior.competition_id=v_round.competition_id
        and prior.round_number=v_round.round_number-1
        and pe.student_id=v_student.id
        and pe.advanced
    )
  );

  v_score_source := case
    when v_round.championship_scoring_mode='ai' then 'ai'
    when v_championship_eligible then 'ai_provisional'
    else 'ai_development'
  end;

  if v_existing.id is not null then
    -- The new attempt supersedes the old one; old sessions/videos stay available.
    -- Reviews of the superseded performance cannot count toward this recording.
    delete from public.competition_judge_reviews where entry_id=v_existing.id;
    update public.competition_entries
    set session_id=v_session.id,score=v_score,original_score=v_score,
        rank=null,advanced=false,submitted_at=clock_timestamp(),
        championship_eligible=v_championship_eligible,score_source=v_score_source,
        score_overridden=false,score_override_reason=null,
        score_overridden_by=null,score_overridden_at=null
    where id=v_existing.id returning * into v_entry;
    return v_entry;
  end if;

  insert into public.competition_entries(
    round_id,student_id,session_id,score,original_score,championship_eligible,score_source
  )
  values(
    v_round.id,v_student.id,v_session.id,v_score,v_score,v_championship_eligible,v_score_source
  )
  returning * into v_entry;

  return v_entry;
end;
$function$;

revoke execute on function public.submit_showdown_entry(uuid,uuid) from public, anon;
grant execute on function public.submit_showdown_entry(uuid,uuid) to authenticated;
