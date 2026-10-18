-- Messaging: a designer could not reply to (or even see) a conversation started by a customer they
-- had no request/project with — e.g. a customer who tapped "Message" on a dress or studio page.
--
-- Cause: two policies depended on the designer being able to READ the customer's profile row, which
-- customer_profiles_select only allows through a shared project or a visible request.
--   1. messages_insert_participant inner-joined customer_profiles to find the participants' user
--      ids. Evaluated as the designer, that join saw no customer row, so every reply was refused.
--   2. The designer inbox resolves each card's customer name/avatar from customer_profiles; with the
--      row hidden, the card was dropped, so the conversation never appeared on the designer side.
--
-- Fix (no table/column/data changes):
--   1. messages_insert_participant now decides participation exactly like conversations_select does —
--      via the SECURITY DEFINER current_customer_id()/current_designer_id() helpers — so it no longer
--      depends on reading the other side's profile. sender_id = auth.uid() is still required.
--   2. customer_profiles_select additionally lets a designer read a customer's profile once THAT
--      CUSTOMER has sent them a message. Deliberately not "any conversation exists": a designer can
--      create a conversation with any customer id, and that alone must never reveal a profile. The
--      sub-select runs under messages/conversations RLS, so it only ever matches the caller's own
--      conversations.

drop policy messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.customer_id = public.current_customer_id() or c.designer_id = public.current_designer_id())
    )
  );

drop policy customer_profiles_select on public.customer_profiles;
create policy customer_profiles_select on public.customer_profiles
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    -- A designer can see a customer's profile if they share a project, or if the designer can
    -- see any request from that customer (both delegate to those tables' own RLS below).
    or exists (select 1 from public.projects p where p.customer_id = customer_profiles.id)
    or exists (select 1 from public.fashion_requests r where r.customer_id = customer_profiles.id)
    -- …or if that customer has messaged them (see header).
    or exists (
      select 1 from public.conversations c
      join public.messages m on m.conversation_id = c.id
      where c.customer_id = customer_profiles.id
        and c.designer_id = public.current_designer_id()
        and m.sender_id = customer_profiles.user_id
    )
  );
