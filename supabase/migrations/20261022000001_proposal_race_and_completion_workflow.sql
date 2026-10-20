-- Proposal/acceptance race, designer-faked acceptance, and the project completion workflow —
-- enforced in the database, not only in API routes.
--
-- 1. Race: a proposal submitted at the same moment a customer accepts another one could be saved as
--    a stray 'pending' proposal on an already-accepted request (the app's open-request check and the
--    insert were not atomic). New proposals now take a row lock on their request (FOR SHARE) and are
--    refused unless the request is still open. accept_proposal() already locks that row FOR UPDATE, so
--    the two serialise: either the proposal commits first (and the acceptance then auto-declines it),
--    or the acceptance commits first (and the proposal is refused). accept_proposal() itself also now
--    refuses a request that is no longer open.
-- 2. proposals_update_own_designer lets a designer update their own proposal row — including its
--    status. A proposal's status may now change only through the request's customer (which is how
--    accept_proposal() runs — SECURITY DEFINER, but auth.uid() is still the customer) or an admin /
--    service-role maintenance session, and only away from 'pending'. A decided proposal is frozen.
-- 3. projects_update_participant lets either participant change any column, so a designer could set
--    status = 'completed' without the customer's confirmation. For signed-in users the only status
--    moves are now the app's own workflow:
--      designer:  active → awaiting_confirmation                       (mark as completed)
--      customer:  awaiting_confirmation → completed (+ completed_at)   (confirm completion)
--                 awaiting_confirmation → active (+ changes_requested_at) (request changes)
--    Ownership columns never change; stage/progress move only with the designer's progress updates
--    (active / awaiting_confirmation) or the customer's request-changes step. Completed projects are
--    already final (20261021000001).
--
-- Service-role / postgres sessions (no auth.uid(), e.g. seeds, imports and maintenance) are not
-- restricted by 1–3, and admins not by 2–3. Nothing here modifies existing rows.

-- ---------------------------------------------------------------------------
-- 1. Proposals only on open requests — serialised with acceptance
-- ---------------------------------------------------------------------------
create function public.guard_proposal_insert_open_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status request_status;
begin
  -- Sessions with no signed-in user (seeds, imports, service-role maintenance) may record historical
  -- proposals; every signed-in path (the app, direct PostgREST) is guarded.
  if auth.uid() is null then
    return new;
  end if;
  -- FOR SHARE: waits for (and is waited on by) accept_proposal()'s FOR UPDATE on the same request.
  select r.status into v_status from public.fashion_requests r where r.id = new.request_id for share;
  if v_status is not null and v_status not in ('submitted', 'proposal_received') then
    raise exception 'request_closed: this request is no longer accepting proposals' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger proposals_insert_open_request_guard
  before insert on public.proposals
  for each row execute function public.guard_proposal_insert_open_request();

-- accept_proposal(): unchanged except for the open-request check (after its row locks).
create or replace function public.accept_proposal(p_proposal_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_customer_id uuid;
  v_request_id uuid;
  v_request_customer_id uuid;
  v_request_status request_status;
  v_designer_id uuid;
  v_proposal_status proposal_status;
  v_project public.projects;
begin
  v_caller_customer_id := public.current_customer_id();
  if v_caller_customer_id is null then
    raise exception 'Only a customer can accept a proposal';
  end if;

  select p.request_id, p.designer_id, p.status
    into v_request_id, v_designer_id, v_proposal_status
  from public.proposals p
  where p.id = p_proposal_id
  for update;

  if v_request_id is null then
    raise exception 'Proposal not found';
  end if;

  select r.customer_id, r.status into v_request_customer_id, v_request_status
  from public.fashion_requests r
  where r.id = v_request_id
  for update;

  if v_request_customer_id is distinct from v_caller_customer_id then
    raise exception 'You do not own the request this proposal belongs to';
  end if;

  if v_request_status not in ('submitted', 'proposal_received') then
    raise exception 'This request already has an accepted proposal';
  end if;

  if v_proposal_status is distinct from 'pending' then
    raise exception 'This proposal is no longer eligible to be accepted';
  end if;

  update public.proposals set status = 'accepted', updated_at = now()
  where id = p_proposal_id;

  -- Auto-decline every other still-pending proposal on the same request.
  update public.proposals
  set status = 'declined', updated_at = now()
  where request_id = v_request_id and id <> p_proposal_id and status = 'pending';

  update public.fashion_requests
  set status = 'accepted', updated_at = now()
  where id = v_request_id;

  insert into public.projects (request_id, proposal_id, customer_id, designer_id)
  values (v_request_id, p_proposal_id, v_caller_customer_id, v_designer_id)
  returning * into v_project;

  return v_project;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. A proposal's decision belongs to the request's customer
-- ---------------------------------------------------------------------------
create function public.guard_proposal_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_customer uuid;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.request_id is distinct from old.request_id or new.designer_id is distinct from old.designer_id then
    raise exception 'proposal_locked: a proposal can''t be moved to another request or designer' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    select r.customer_id into v_request_customer from public.fashion_requests r where r.id = old.request_id;
    if old.status <> 'pending' or new.status = 'pending'
       or v_request_customer is distinct from public.current_customer_id() then
      raise exception 'proposal_locked: only the customer can accept or decline a proposal' using errcode = '42501';
    end if;
  end if;
  if old.status <> 'pending' and (
    new.price is distinct from old.price or new.estimated_days is distinct from old.estimated_days
    or new.description is distinct from old.description or new.notes is distinct from old.notes
  ) then
    raise exception 'proposal_locked: an accepted or declined proposal can''t be edited' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger proposals_update_guard
  before update on public.proposals
  for each row execute function public.guard_proposal_update();

-- ---------------------------------------------------------------------------
-- 3. Project completion workflow
-- ---------------------------------------------------------------------------
create function public.guard_project_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_customer boolean;
  v_is_designer boolean;
  v_move text;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  -- coalesce: a NULL (caller isn't that role) must count as false, or NULL logic would let checks slip
  v_is_customer := coalesce(old.customer_id = public.current_customer_id(), false);
  v_is_designer := coalesce(old.designer_id = public.current_designer_id(), false);

  if new.customer_id is distinct from old.customer_id or new.designer_id is distinct from old.designer_id
     or new.request_id is distinct from old.request_id or new.proposal_id is distinct from old.proposal_id then
    raise exception 'project_workflow: a project''s customer, designer, request and proposal can''t change' using errcode = '42501';
  end if;

  v_move := case
    when new.status is not distinct from old.status then 'none'
    when old.status = 'active' and new.status = 'awaiting_confirmation' and v_is_designer then 'mark_completed'
    when old.status = 'awaiting_confirmation' and new.status = 'completed' and v_is_customer then 'confirm'
    when old.status = 'awaiting_confirmation' and new.status = 'active' and v_is_customer then 'request_changes'
    else 'invalid'
  end;
  if v_move = 'invalid' then
    raise exception 'project_workflow: only the customer can confirm completion — the designer marks the project completed and the customer confirms it' using errcode = '42501';
  end if;

  if new.completed_at is distinct from old.completed_at and v_move <> 'confirm' then
    raise exception 'project_workflow: the completion date is set only when the customer confirms completion' using errcode = '42501';
  end if;
  if new.changes_requested_at is distinct from old.changes_requested_at and v_move <> 'request_changes' then
    raise exception 'project_workflow: only the customer can request changes' using errcode = '42501';
  end if;

  if (new.stage is distinct from old.stage or new.progress_percent is distinct from old.progress_percent or new.stages is distinct from old.stages)
     and not (
       v_move = 'request_changes'
       or (v_is_designer and v_move in ('none', 'mark_completed') and old.status in ('active', 'awaiting_confirmation') and new.stages is not distinct from old.stages)
     ) then
    raise exception 'project_workflow: progress moves only with the designer''s progress updates' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger projects_workflow_guard
  before update on public.projects
  for each row execute function public.guard_project_workflow();
