-- Who may START a conversation (insert a conversations row). Until now conversations_insert_participant
-- only required the caller to be one of the two sides, so a designer could open a conversation with
-- ANY customer id, and an account holding both profiles could open one with itself.
--
-- can_start_conversation() is the single rule, used by this policy AND by the app routes
-- (app/api/conversations, app/api/designer/conversations) so both give the same answer:
--   * never an account with itself (its own customer profile ↔ its own designer profile);
--   * a CUSTOMER may contact a designer who is approved and not admin-owned (the public studio /
--     dress / request flows), or one they already work with (a proposal or a project);
--   * a DESIGNER may contact a customer only through a real relationship:
--       - they share a project, or this designer has sent a proposal on one of the customer's
--         requests (any status — an ongoing working relationship), or
--       - the customer has an OPEN request (submitted / reviewed / proposal_received) that is
--         directed at this designer, or is public while this designer is approved — exactly the
--         requests the designer can already see and act on.
-- Existing conversations are unaffected: participants keep reading/sending (messages policies), and
-- the routes return an existing conversation before ever attempting an insert.
--
-- SECURITY DEFINER so the relationship lookups don't depend on what the caller can read; it only
-- ever answers for the CALLER's own ids (current_customer_id()/current_designer_id()) and returns a
-- boolean — no rows are exposed. Anyone else (incl. anon) always gets false.

create function public.can_start_conversation(p_customer_id uuid, p_designer_id uuid)
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
  )
  select case
    when p_customer_id is null or p_designer_id is null then false
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
  from me, works_together, designer_approved;
$$;

revoke execute on function public.can_start_conversation(uuid, uuid) from public, anon;
grant execute on function public.can_start_conversation(uuid, uuid) to authenticated;

drop policy conversations_insert_participant on public.conversations;
create policy conversations_insert_participant on public.conversations
  for insert with check (public.can_start_conversation(customer_id, designer_id));
