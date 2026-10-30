-- Customer request deletion (before a designer is chosen) and mutual project withdrawal (after).
--
-- Decisions (agreed with the product owner):
--   * "Delete request" closes it, never hard-deletes: the request becomes 'cancelled' (an existing,
--     previously unused status) and pending proposals become 'declined'. A real DELETE would cascade
--     away every designer's proposal (proposals.request_id ON DELETE CASCADE). Cancelled requests are
--     hidden from the customer's lists, Discover and notifications; rows stay for history/audit.
--   * Withdrawal needs both participants: one requests it with a reason, the OTHER approves or
--     rejects it. Approval sets the project to the new final status 'withdrawn' (20261023000001) and
--     closes its request ('cancelled'). Completed / withdrawn / cancelled projects are ineligible.
--
-- Every state change runs in a SECURITY DEFINER function with row locks; the tables carry no
-- client write policies, and BEFORE UPDATE guards make the same transitions impossible by a direct
-- PostgREST update (requests: guard_request_status; projects: guard_project_workflow, extended).
-- Sessions with no signed-in user (seeds, maintenance) and admins are not restricted by the guards.

-- ---------------------------------------------------------------------------
-- Withdrawal records
-- ---------------------------------------------------------------------------
create table public.project_withdrawals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  requested_by_role text not null check (requested_by_role in ('customer', 'designer')),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'closed')),
  responded_by uuid references auth.users (id),
  response_reason text check (response_reason is null or length(response_reason) <= 1000),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check ((status = 'pending') = (responded_at is null))
);

comment on table public.project_withdrawals is
  'Mutual withdrawal requests for a project. Written only by request_project_withdrawal() / '
  'respond_project_withdrawal() (and closed automatically if the project completes). status: '
  'pending → approved (project withdrawn) | rejected (project unchanged) | closed (project completed '
  'while it was pending). History is never deleted.';

-- At most one pending withdrawal per project — the hard guarantee behind "no duplicate requests".
create unique index project_withdrawals_one_pending_per_project
  on public.project_withdrawals (project_id) where (status = 'pending');
create index project_withdrawals_project_idx on public.project_withdrawals (project_id, created_at desc);

alter table public.project_withdrawals enable row level security;

create policy project_withdrawals_select_participants on public.project_withdrawals
  for select using (exists (
    select 1 from public.projects p
    where p.id = project_id
      and (p.customer_id = public.current_customer_id() or p.designer_id = public.current_designer_id() or public.is_admin())
  ));
-- No insert/update/delete policies: only the functions below write this table.
revoke all on table public.project_withdrawals from anon;

-- ---------------------------------------------------------------------------
-- Withdrawn projects are final (like completed ones): no progress-history changes
-- ---------------------------------------------------------------------------
create or replace function public.project_progress_locked(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.projects p where p.id = p_project_id and p.status in ('completed', 'withdrawn'));
$$;

-- ---------------------------------------------------------------------------
-- Request status guard
-- ---------------------------------------------------------------------------
create function public.guard_request_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if new.status is not distinct from old.status or auth.uid() is null or public.is_admin() then
    return new;
  end if;
  v_ok := case
    -- mark_request_proposal_received(): a designer who has proposed on it
    when old.status = 'submitted' and new.status = 'proposal_received' then
      exists (select 1 from public.proposals p where p.request_id = old.id and p.designer_id = public.current_designer_id())
    -- accept_proposal(): the customer, once a proposal on it is accepted
    when old.status in ('submitted', 'proposal_received') and new.status = 'accepted' then
      old.customer_id = public.current_customer_id()
      and exists (select 1 from public.proposals p where p.request_id = old.id and p.status = 'accepted')
    -- cancel_request(): the customer, with no project and no pending proposal left
    when old.status in ('draft', 'submitted', 'reviewed', 'proposal_received') and new.status = 'cancelled' then
      old.customer_id = public.current_customer_id()
      and not exists (select 1 from public.projects pr where pr.request_id = old.id)
      and not exists (select 1 from public.proposals p where p.request_id = old.id and p.status = 'pending')
    -- respond_project_withdrawal(): its project has been withdrawn
    when old.status = 'accepted' and new.status = 'cancelled' then
      exists (select 1 from public.projects pr where pr.request_id = old.id and pr.status = 'withdrawn')
    else false
  end;
  if not coalesce(v_ok, false) then
    raise exception 'request_workflow: a request''s status changes only through HRUNA''s request, proposal and withdrawal steps' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger fashion_requests_status_guard
  before update on public.fashion_requests
  for each row execute function public.guard_request_status();

-- ---------------------------------------------------------------------------
-- Delete (close) a request before any designer is chosen
-- ---------------------------------------------------------------------------
create function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_status request_status;
begin
  if public.current_customer_id() is null then
    raise exception 'Only the customer who posted a request can delete it';
  end if;
  -- FOR UPDATE: serialises with accept_proposal() and with proposal inserts (FOR SHARE).
  select r.customer_id, r.status into v_customer, v_status from public.fashion_requests r where r.id = p_request_id for update;
  if v_customer is null or v_customer is distinct from public.current_customer_id() then
    raise exception 'Request not found';
  end if;
  if v_status = 'cancelled' then
    raise exception 'This request has already been deleted';
  end if;
  if v_status not in ('draft', 'submitted', 'reviewed', 'proposal_received')
     or exists (select 1 from public.projects pr where pr.request_id = p_request_id) then
    raise exception 'This request already has a designer — use Request Withdrawal on the project instead';
  end if;

  update public.proposals set status = 'declined', updated_at = now()
  where request_id = p_request_id and status = 'pending';
  update public.fashion_requests set status = 'cancelled', updated_at = now()
  where id = p_request_id;
end;
$$;

comment on function public.cancel_request(uuid) is
  'Customer "Delete request" before a designer is chosen: closes it (status cancelled), declines '
  'pending proposals; nothing is physically deleted. Row-locked against concurrent acceptance.';

revoke execute on function public.cancel_request(uuid) from public, anon;
grant execute on function public.cancel_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mutual withdrawal
-- ---------------------------------------------------------------------------
create function public.request_project_withdrawal(p_project_id uuid, p_reason text)
returns public.project_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_role text;
  v_row public.project_withdrawals;
begin
  if auth.uid() is null then
    raise exception 'Sign in to request a withdrawal';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Please give a reason for the withdrawal';
  end if;
  if length(btrim(p_reason)) > 1000 then
    raise exception 'Please keep the reason under 1000 characters';
  end if;

  select * into v_project from public.projects where id = p_project_id for update;
  if v_project.id is null then
    raise exception 'Project not found';
  end if;
  v_role := case
    when v_project.customer_id = public.current_customer_id() then 'customer'
    when v_project.designer_id = public.current_designer_id() then 'designer'
  end;
  if v_role is null then
    raise exception 'Only this project''s customer or designer can request a withdrawal';
  end if;
  if v_project.status not in ('active', 'awaiting_confirmation', 'on_hold') then
    raise exception 'This project can''t be withdrawn (it is %)', v_project.status;
  end if;
  if exists (select 1 from public.project_withdrawals w where w.project_id = p_project_id and w.status = 'pending') then
    raise exception 'A withdrawal request is already waiting for a response on this project';
  end if;

  insert into public.project_withdrawals (project_id, requested_by, requested_by_role, reason)
  values (p_project_id, auth.uid(), v_role, btrim(p_reason))
  returning * into v_row;
  return v_row;
end;
$$;

create function public.respond_project_withdrawal(p_withdrawal_id uuid, p_approve boolean, p_reason text default null)
returns public.project_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.project_withdrawals;
  v_project public.projects;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to a withdrawal';
  end if;
  if p_reason is not null and length(p_reason) > 1000 then
    raise exception 'Please keep the reason under 1000 characters';
  end if;

  select * into v_row from public.project_withdrawals where id = p_withdrawal_id;
  if v_row.id is null then
    raise exception 'Withdrawal request not found';
  end if;
  -- Same lock order as request_project_withdrawal(): project first, then the withdrawal row.
  select * into v_project from public.projects where id = v_row.project_id for update;
  select * into v_row from public.project_withdrawals where id = p_withdrawal_id for update;

  v_role := case
    when v_project.customer_id = public.current_customer_id() then 'customer'
    when v_project.designer_id = public.current_designer_id() then 'designer'
  end;
  if v_role is null then
    raise exception 'Only this project''s customer or designer can respond to a withdrawal';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This withdrawal request has already been answered';
  end if;
  if v_row.requested_by = auth.uid() or v_row.requested_by_role = v_role then
    raise exception 'You can''t answer your own withdrawal request — the other participant has to';
  end if;
  if v_project.status not in ('active', 'awaiting_confirmation', 'on_hold') then
    raise exception 'This project can''t be withdrawn (it is %)', v_project.status;
  end if;

  update public.project_withdrawals
  set status = case when p_approve then 'approved' else 'rejected' end,
      responded_by = auth.uid(),
      response_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      responded_at = now()
  where id = p_withdrawal_id
  returning * into v_row;

  if p_approve then
    -- Both parties have now agreed: the project ends as withdrawn and its request closes.
    update public.projects set status = 'withdrawn', updated_at = now() where id = v_project.id;
    update public.fashion_requests set status = 'cancelled', updated_at = now() where id = v_project.request_id;
  end if;
  return v_row;
end;
$$;

revoke execute on function public.request_project_withdrawal(uuid, text) from public, anon;
revoke execute on function public.respond_project_withdrawal(uuid, boolean, text) from public, anon;
grant execute on function public.request_project_withdrawal(uuid, text) to authenticated;
grant execute on function public.respond_project_withdrawal(uuid, boolean, text) to authenticated;

-- A project completed while a withdrawal was pending: the request is moot — close it (kept as history).
create function public.close_pending_withdrawals_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.project_withdrawals
    set status = 'closed', response_reason = 'The project was completed.', responded_at = now()
    where project_id = new.id and status = 'pending';
  end if;
  return null;
end;
$$;

create trigger projects_close_withdrawals_on_completion
  after update on public.projects
  for each row execute function public.close_pending_withdrawals_on_completion();

-- ---------------------------------------------------------------------------
-- Project workflow guard: + the withdrawal move (only with an approved withdrawal)
-- ---------------------------------------------------------------------------
create or replace function public.guard_project_workflow()
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
    -- respond_project_withdrawal(): only after the OTHER participant approved a pending request
    when old.status in ('active', 'awaiting_confirmation', 'on_hold') and new.status = 'withdrawn' and (v_is_customer or v_is_designer)
         and exists (select 1 from public.project_withdrawals w where w.project_id = old.id and w.status = 'approved') then 'withdraw'
    else 'invalid'
  end;
  if v_move = 'invalid' then
    raise exception 'project_workflow: only the customer can confirm completion — the designer marks the project completed and the customer confirms it; withdrawal needs both participants to agree' using errcode = '42501';
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
