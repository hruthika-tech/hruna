-- Which notifications each user has read. The notification feeds themselves are not stored — they are
-- built on request from the user's own proposals, messages, project updates, reviews, etc.
-- (app/api/notifications, app/api/designer/notifications via lib/notifications/feed.ts), and every
-- item has a stable key such as "proposal-<uuid>". This table only remembers which of those keys a
-- user has opened, so the unread badge and the "unread" styling survive reloads, devices and sign-ins.
--
-- One row per (user, key). Users can only see and add their OWN rows; nobody can edit or remove rows
-- (reading something can't be undone, and no client needs to). Rows go with the account
-- (on delete cascade). No other table is touched.

create table public.notification_reads (
  user_id uuid not null references public.users (id) on delete cascade,
  notification_key text not null check (char_length(notification_key) between 1 and 200),
  read_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

comment on table public.notification_reads is
  'Per-user read markers for the generated notification feeds (keys like "proposal-<uuid>"). Own rows only.';

alter table public.notification_reads enable row level security;

create policy notification_reads_select_own on public.notification_reads
  for select using (user_id = auth.uid());

create policy notification_reads_insert_own on public.notification_reads
  for insert with check (user_id = auth.uid());

-- Signed-out visitors have no use for it at all.
revoke all on table public.notification_reads from anon;
