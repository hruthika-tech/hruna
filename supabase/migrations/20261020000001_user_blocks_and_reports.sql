-- Block user + Report user for messaging, and the admin review of reports.
--
-- BLOCKS. One row per (blocker, blocked). While a block exists in EITHER direction:
--   * neither user can send a message in any conversation between them (messages_insert_participant),
--   * neither can start a new conversation with the other (can_start_conversation),
-- in the database itself, so no client or API path can bypass it. Existing messages, conversations,
-- projects, proposals and requests are untouched; removing the block restores messaging only where
-- the normal rules (can_start_conversation, participant checks) already allow it. Users see and manage
-- only their OWN blocks; nobody can see who blocked them.
--
-- REPORTS. A report names the reported user, a reason, an optional description and — only if the
-- reporter chooses — evidence from THEIR OWN conversation with that user. Reporters can read their own
-- reports; the reported user never can; only admins can read all and record a review (status +
-- decision). What was reported can't be rewritten afterwards, even by an admin, and reports are never
-- deleted. Nothing here suspends or restricts any account.
--
-- The two replaced objects (can_start_conversation, messages_insert_participant) are reproduced from
-- 20261012000002 / 20261012000001 with ONLY the block check added.

-- ===========================================================================
-- Blocks
-- ===========================================================================
create table public.user_blocks (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

comment on table public.user_blocks is
  'Messaging blocks. A row in either direction stops messages and new conversations between the two users. Own rows only.';

alter table public.user_blocks enable row level security;

create policy user_blocks_select_own on public.user_blocks
  for select using (blocker_id = auth.uid());
create policy user_blocks_insert_own on public.user_blocks
  for insert with check (blocker_id = auth.uid());
create policy user_blocks_delete_own on public.user_blocks
  for delete using (blocker_id = auth.uid());

revoke all on table public.user_blocks from anon;

-- The caller's block state in one of THEIR OWN conversations — null if they're not a participant:
--   'blocked_by_me'  the caller blocked the other participant
--   'blocked_me'     the other participant blocked the caller
--   'none'
-- SECURITY DEFINER so it can see the other side's block (which RLS hides); it only ever answers for
-- auth.uid()'s own conversations and returns a word, never rows.
create function public.conversation_block_state(p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with parties as (
    select cp.user_id as customer_user, dp.user_id as designer_user
    from public.conversations c
    join public.customer_profiles cp on cp.id = c.customer_id
    join public.designer_profiles dp on dp.id = c.designer_id
    where c.id = p_conversation_id
  ),
  me as (
    select p.*, auth.uid() as uid,
           case when auth.uid() = p.customer_user then p.designer_user else p.customer_user end as other
    from parties p
    where auth.uid() in (p.customer_user, p.designer_user)
  )
  select case
    when not exists (select 1 from me) then null
    when exists (select 1 from me join public.user_blocks b on b.blocker_id = me.uid and b.blocked_id = me.other) then 'blocked_by_me'
    when exists (select 1 from me join public.user_blocks b on b.blocker_id = me.other and b.blocked_id = me.uid) then 'blocked_me'
    else 'none'
  end;
$$;

revoke execute on function public.conversation_block_state(uuid) from public, anon;
grant execute on function public.conversation_block_state(uuid) to authenticated;

-- The OTHER participant's user id in one of the caller's own conversations (null otherwise). Lets
-- Block / Report derive their target from a conversation the caller is really in, instead of trusting
-- a user id from the client — and works even when RLS hides the other side's profile row.
create function public.conversation_other_user(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when auth.uid() = cp.user_id then dp.user_id else cp.user_id end
  from public.conversations c
  join public.customer_profiles cp on cp.id = c.customer_id
  join public.designer_profiles dp on dp.id = c.designer_id
  where c.id = p_conversation_id
    and auth.uid() in (cp.user_id, dp.user_id)
    and cp.user_id <> dp.user_id;
$$;

revoke execute on function public.conversation_other_user(uuid) from public, anon;
grant execute on function public.conversation_other_user(uuid) to authenticated;

-- The caller's OWN block list with a name to show in Settings (studio name, customer name, or a
-- neutral fallback) — only for people the caller blocked.
create function public.my_blocked_users()
returns table (blocked_id uuid, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.blocked_id,
         coalesce(
           (select d.studio_name from public.designer_profiles d where d.user_id = b.blocked_id),
           (select c.name from public.customer_profiles c where c.user_id = b.blocked_id),
           (select u.display_name from public.users u where u.id = b.blocked_id),
           'HRUNA member'
         ),
         b.created_at
  from public.user_blocks b
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke execute on function public.my_blocked_users() from public, anon;
grant execute on function public.my_blocked_users() to authenticated;

-- Sending: unchanged from 20261012000001 except the final block check.
drop policy messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.customer_id = public.current_customer_id() or c.designer_id = public.current_designer_id())
    )
    and public.conversation_block_state(conversation_id) = 'none'
  );

-- Starting a conversation: unchanged from 20261012000002 except the `blocked` check.
create or replace function public.can_start_conversation(p_customer_id uuid, p_designer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select public.current_customer_id() as customer_id, public.current_designer_id() as designer_id
  ),
  works_together as (
    select
      exists (select 1 from public.projects p where p.customer_id = p_customer_id and p.designer_id = p_designer_id)
      or exists (
        select 1 from public.proposals pr
        join public.fashion_requests r on r.id = pr.request_id
        where r.customer_id = p_customer_id and pr.designer_id = p_designer_id
      ) as yes
  ),
  designer_approved as (
    select exists (
      select 1 from public.designer_verifications v
      where v.designer_id = p_designer_id and v.overall_status = 'approved'
    ) as yes
  ),
  blocked as (
    -- A block in either direction between the two accounts.
    select exists (
      select 1
      from public.customer_profiles cp
      join public.designer_profiles dp on dp.id = p_designer_id
      join public.user_blocks b
        on (b.blocker_id = cp.user_id and b.blocked_id = dp.user_id)
        or (b.blocker_id = dp.user_id and b.blocked_id = cp.user_id)
      where cp.id = p_customer_id
    ) as yes
  )
  select case
    when p_customer_id is null or p_designer_id is null then false
    -- Never between accounts that have blocked each other.
    when blocked.yes then false
    -- Never an account with itself.
    when p_customer_id = me.customer_id and p_designer_id = me.designer_id then false
    -- The caller is the customer side.
    when p_customer_id = me.customer_id then
      not exists (
        select 1 from public.designer_profiles d join public.users u on u.id = d.user_id
        where d.id = p_designer_id and u.is_admin
      )
      and (designer_approved.yes or works_together.yes)
    -- The caller is the designer side.
    when p_designer_id = me.designer_id then
      works_together.yes
      or exists (
        select 1 from public.fashion_requests r
        where r.customer_id = p_customer_id
          and r.status in ('submitted', 'reviewed', 'proposal_received')
          and (r.preferred_designer_id = p_designer_id or (r.visibility = 'public' and designer_approved.yes))
      )
    else false
  end
  from me, works_together, designer_approved, blocked;
$$;

-- ===========================================================================
-- Reports
-- ===========================================================================
create type public.user_report_reason as enum ('harassment', 'scam', 'spam', 'inappropriate', 'impersonation', 'other');
create type public.user_report_status as enum ('pending', 'under_review', 'resolved', 'dismissed');

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  -- Kept if the reporter's account is later deleted (the report is a moderation record).
  reporter_id uuid references public.users (id) on delete set null,
  reported_id uuid not null references public.users (id) on delete cascade,
  reason public.user_report_reason not null,
  description text check (description is null or char_length(description) <= 2000),
  -- Evidence the reporter chose to include, from their own conversation with the reported user.
  conversation_id uuid references public.conversations (id) on delete set null,
  message_ids uuid[] not null default '{}' check (cardinality(message_ids) <= 20),
  status public.user_report_status not null default 'pending',
  admin_decision text check (admin_decision is null or char_length(admin_decision) <= 2000),
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reports_not_self check (reporter_id is null or reporter_id <> reported_id),
  constraint user_reports_evidence_needs_conversation check (cardinality(message_ids) = 0 or conversation_id is not null)
);

comment on table public.user_reports is
  'User reports for admin review. Reporter reads own; reported user never; admins read all and record status/decision. Never deleted; never suspends anyone by itself.';

create index user_reports_status_created_idx on public.user_reports (status, created_at desc);

-- The evidence must come from the CALLER's own conversation with the reported user, and every chosen
-- message must belong to that conversation. SECURITY DEFINER for the participant lookup; answers only
-- about auth.uid()'s own conversations.
create function public.user_report_evidence_ok(p_reported_id uuid, p_conversation_id uuid, p_message_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_conversation_id is null then coalesce(cardinality(p_message_ids), 0) = 0
    else exists (
      select 1
      from public.conversations c
      join public.customer_profiles cp on cp.id = c.customer_id
      join public.designer_profiles dp on dp.id = c.designer_id
      where c.id = p_conversation_id
        and ((cp.user_id = auth.uid() and dp.user_id = p_reported_id) or (dp.user_id = auth.uid() and cp.user_id = p_reported_id))
    )
    and not exists (
      select 1 from unnest(coalesce(p_message_ids, '{}')) as m(id)
      where not exists (select 1 from public.messages x where x.id = m.id and x.conversation_id = p_conversation_id)
    )
  end;
$$;

revoke execute on function public.user_report_evidence_ok(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.user_report_evidence_ok(uuid, uuid, uuid[]) to authenticated;

-- What was reported is fixed once filed; only the review fields may change (and updated_at follows).
create function public.user_reports_protect_original()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reporter_id is distinct from old.reporter_id and new.reporter_id is not null
     or new.reported_id is distinct from old.reported_id
     or new.reason is distinct from old.reason
     or new.description is distinct from old.description
     or new.conversation_id is distinct from old.conversation_id and new.conversation_id is not null
     or new.message_ids is distinct from old.message_ids
     or new.created_at is distinct from old.created_at then
    raise exception 'A report''s original contents can''t be changed.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_reports_protect_original
  before update on public.user_reports
  for each row execute function public.user_reports_protect_original();

alter table public.user_reports enable row level security;

create policy user_reports_select on public.user_reports
  for select using (reporter_id = auth.uid() or public.is_admin());

-- Filing: as yourself, about someone else, as a fresh pending report with valid evidence.
create policy user_reports_insert_own on public.user_reports
  for insert with check (
    reporter_id = auth.uid()
    and reported_id <> auth.uid()
    and status = 'pending'
    and admin_decision is null
    and reviewed_by is null
    and reviewed_at is null
    and public.user_report_evidence_ok(reported_id, conversation_id, message_ids)
  );

-- Reviewing: admins only. No delete policy for anyone.
create policy user_reports_update_admin on public.user_reports
  for update using (public.is_admin()) with check (public.is_admin());

revoke all on table public.user_reports from anon;
