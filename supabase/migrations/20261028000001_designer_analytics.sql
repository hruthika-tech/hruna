-- Designer analytics.
--
-- 1. public.analytics_events — the only NEW data: public studio/dress page views and save events,
--    which the app never recorded before (customer_saved_items keeps only current saves, and an
--    unsave deletes the row). Everything else the dashboard shows (direct requests, proposals,
--    conversations, projects started/completed) already has real timestamps in its own table and
--    is read from there — never duplicated as events.
--
--    Privacy-minimal: no IP address, user agent, referrer, message, image or page content. A
--    visitor is a one-way hash (of a random first-party cookie, or of the signed-in user id) so a
--    view can be counted once per visitor per day. viewer_user_id is kept only for signed-in
--    viewers, solely to measure conversion (did a viewer later save / message / request?), and is
--    never returned to anyone — the table has RLS on and NO policies or grants for anon or
--    authenticated: rows are written only by the server (service role, app/api/analytics/view and
--    app/api/saved-items) and read only through designer_analytics() below, as aggregates.
--
-- 2. public.designer_analytics(p_start, p_end) — SECURITY DEFINER, but scoped to the CALLER's own
--    designer profile (current_designer_id()); it takes no designer id, so nobody can ask for
--    another designer's numbers. Returns aggregates only.
--
-- Days are calendar days in Asia/Kolkata (HRUNA's market), for both tracked and existing data.
-- Statuses are compared as text so this migration doesn't depend on the order in which the
-- project_status enum gained values.

create table public.analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('studio_view', 'dress_view', 'item_saved')),
  -- The designer the event belongs to — always resolved by the server from the target, never
  -- taken from the client.
  designer_id uuid not null references public.designer_profiles (id) on delete cascade,
  -- What the event is about: the studio (= designer id), a dress, or a collection. Not a foreign
  -- key, so history survives a deleted dress (dress_id below is then nulled).
  target_id uuid not null,
  dress_id uuid references public.dresses (id) on delete set null,
  visitor_key text not null check (char_length(visitor_key) between 16 and 80),
  viewer_user_id uuid references auth.users (id) on delete set null,
  -- sha256(ip | day | salt) — only for the per-network daily abuse cap; rotates every day.
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now(),
  event_day date not null default ((now() at time zone 'Asia/Kolkata')::date),
  constraint analytics_events_dress_matches_type check (
    (event_type = 'dress_view' and dress_id is not null and target_id = dress_id)
    or event_type <> 'dress_view'
  ),
  constraint analytics_events_studio_matches_type check (
    (event_type = 'studio_view' and target_id = designer_id and dress_id is null)
    or event_type <> 'studio_view'
  )
);

comment on table public.analytics_events is
  'Designer analytics events (studio/dress views, saves). Server-written only; read via designer_analytics(). No PII beyond a hashed visitor key.';

-- One counted event per visitor, per target, per event type, per day — re-renders, React Strict
-- Mode, reloads and duplicate submissions all land on this and are ignored.
create unique index analytics_events_dedupe_uq
  on public.analytics_events (event_type, target_id, visitor_key, event_day);
create index analytics_events_designer_day_idx
  on public.analytics_events (designer_id, event_day, event_type);
create index analytics_events_ip_day_idx
  on public.analytics_events (ip_hash, event_day) where ip_hash is not null;
create index analytics_events_viewer_idx
  on public.analytics_events (designer_id, viewer_user_id) where viewer_user_id is not null;

alter table public.analytics_events enable row level security;
-- No policies on purpose: anon and authenticated can neither read nor write rows.
revoke all on table public.analytics_events from anon, authenticated;
revoke all on sequence public.analytics_events_id_seq from anon, authenticated;

create or replace function public.designer_analytics(p_start date, p_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_designer uuid := public.current_designer_id();
  v_tz constant text := 'Asia/Kolkata';
  v_span int;
  v_prev_start date;
  v_t0 timestamptz;
  v_t1 timestamptz;
  v_cur_t0 timestamptz;
  v_result jsonb;
begin
  if v_designer is null or public.is_admin() then
    raise exception 'analytics: a designer profile is required' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 365
     or p_end > (now() at time zone v_tz)::date + 1 then
    raise exception 'analytics: invalid date range' using errcode = '22023';
  end if;

  v_span := p_end - p_start + 1;
  v_prev_start := p_start - v_span;
  v_t0 := v_prev_start::timestamp at time zone v_tz;      -- start of the previous window
  v_cur_t0 := p_start::timestamp at time zone v_tz;       -- start of the selected window
  v_t1 := (p_end + 1)::timestamp at time zone v_tz;       -- end of the selected window (exclusive)

  with facts as (
    select e.event_type as metric, e.event_day as day
      from public.analytics_events e
     where e.designer_id = v_designer and e.event_day between v_prev_start and p_end
    union all
    select 'conversations', (c.created_at at time zone v_tz)::date
      from public.conversations c
     where c.designer_id = v_designer and c.created_at >= v_t0 and c.created_at < v_t1
    union all
    -- Requests sent directly to this designer (a draft hasn't been sent yet).
    select 'requests', (r.created_at at time zone v_tz)::date
      from public.fashion_requests r
     where r.preferred_designer_id = v_designer and r.status::text <> 'draft'
       and r.created_at >= v_t0 and r.created_at < v_t1
    union all
    select 'proposals', (p.created_at at time zone v_tz)::date
      from public.proposals p
     where p.designer_id = v_designer and p.created_at >= v_t0 and p.created_at < v_t1
    union all
    -- A project row is created exactly once, when the customer accepts the proposal.
    select 'projects_started', (p.created_at at time zone v_tz)::date
      from public.projects p
     where p.designer_id = v_designer and p.created_at >= v_t0 and p.created_at < v_t1
    union all
    select 'projects_completed', (p.completed_at at time zone v_tz)::date
      from public.projects p
     where p.designer_id = v_designer and p.completed_at is not null
       and p.completed_at >= v_t0 and p.completed_at < v_t1
  ),
  days as (
    select d::date as day from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d
  ),
  daily as (
    select days.day,
           count(f.metric) filter (where f.metric = 'studio_view') as studio_views,
           count(f.metric) filter (where f.metric = 'dress_view') as dress_views,
           count(f.metric) filter (where f.metric = 'item_saved') as saves,
           count(f.metric) filter (where f.metric = 'conversations') as conversations,
           count(f.metric) filter (where f.metric = 'requests') as requests,
           count(f.metric) filter (where f.metric = 'proposals') as proposals,
           count(f.metric) filter (where f.metric = 'projects_started') as projects_started,
           count(f.metric) filter (where f.metric = 'projects_completed') as projects_completed
      from days left join facts f on f.day = days.day
     group by days.day
  ),
  windows as (
    select w.name,
           count(f.metric) filter (where f.metric = 'studio_view') as studio_views,
           count(f.metric) filter (where f.metric = 'dress_view') as dress_views,
           count(f.metric) filter (where f.metric = 'item_saved') as saves,
           count(f.metric) filter (where f.metric = 'conversations') as conversations,
           count(f.metric) filter (where f.metric = 'requests') as requests,
           count(f.metric) filter (where f.metric = 'proposals') as proposals,
           count(f.metric) filter (where f.metric = 'projects_started') as projects_started,
           count(f.metric) filter (where f.metric = 'projects_completed') as projects_completed
      from (values ('current', p_start, p_end), ('previous', v_prev_start, p_start - 1)) as w(name, w_start, w_end)
      left join facts f on f.day between w.w_start and w.w_end
     group by w.name
  ),
  visitors as (
    select count(distinct e.visitor_key) filter (where e.event_day >= p_start) as current,
           count(distinct e.visitor_key) filter (where e.event_day < p_start) as previous
      from public.analytics_events e
     where e.designer_id = v_designer and e.event_type in ('studio_view', 'dress_view')
       and e.event_day between v_prev_start and p_end
  ),
  -- Conversion: signed-in viewers in the window, and how many of them — after their first view in
  -- the window — saved one of this designer's items, started a conversation, or sent a direct request.
  viewers as (
    select e.viewer_user_id, min(e.occurred_at) as first_view
      from public.analytics_events e
     where e.designer_id = v_designer and e.event_type in ('studio_view', 'dress_view')
       and e.viewer_user_id is not null and e.event_day between p_start and p_end
     group by e.viewer_user_id
  ),
  converted as (
    select v.viewer_user_id
      from viewers v
     where exists (
             select 1 from public.analytics_events s
              where s.designer_id = v_designer and s.event_type = 'item_saved'
                and s.viewer_user_id = v.viewer_user_id and s.occurred_at >= v.first_view and s.occurred_at < v_t1)
        or exists (
             select 1 from public.conversations c
               join public.customer_profiles cp on cp.id = c.customer_id
              where c.designer_id = v_designer and cp.user_id = v.viewer_user_id
                and c.created_at >= v.first_view and c.created_at < v_t1)
        or exists (
             select 1 from public.fashion_requests r
               join public.customer_profiles cp on cp.id = r.customer_id
              where r.preferred_designer_id = v_designer and r.status::text <> 'draft'
                and cp.user_id = v.viewer_user_id and r.created_at >= v.first_view and r.created_at < v_t1)
  ),
  top_dresses as (
    select d.id, d.name, count(*) as views
      from public.analytics_events e
      join public.dresses d on d.id = e.dress_id and d.designer_id = v_designer
     where e.designer_id = v_designer and e.event_type = 'dress_view' and e.event_day between p_start and p_end
     group by d.id, d.name
     order by count(*) desc, d.name
     limit 5
  )
  select jsonb_build_object(
    'start', p_start,
    'end', p_end,
    'previous_start', v_prev_start,
    'previous_end', p_start - 1,
    'tracking_started_on', (select min(event_day) from public.analytics_events),
    'series', (select jsonb_agg(to_jsonb(daily) order by daily.day) from daily),
    'current', (select to_jsonb(windows) - 'name' from windows where name = 'current'),
    'previous', (select to_jsonb(windows) - 'name' from windows where name = 'previous'),
    'unique_visitors', (select jsonb_build_object('current', current, 'previous', previous) from visitors),
    'conversion', jsonb_build_object(
      'eligible_viewers', (select count(*) from viewers),
      'converted', (select count(*) from converted)),
    'top_dresses', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'views', views) order by views desc, name) from top_dresses), '[]'::jsonb),
    'snapshot', jsonb_build_object(
      'projects_total', (select count(*) from public.projects p where p.designer_id = v_designer),
      'projects_active', (select count(*) from public.projects p where p.designer_id = v_designer
                            and p.status::text in ('active', 'on_hold', 'awaiting_confirmation')),
      'projects_completed', (select count(*) from public.projects p where p.designer_id = v_designer
                               and p.status::text = 'completed'),
      'saves_current', (select count(*) from public.customer_saved_items s
                         where s.designer_id = v_designer
                            or s.dress_id in (select id from public.dresses where designer_id = v_designer)
                            or s.collection_id in (select id from public.collections where designer_id = v_designer)))
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.designer_analytics(date, date) is
  'Aggregate analytics for the calling designer only (current_designer_id()). Dates are Asia/Kolkata calendar days, inclusive.';

revoke execute on function public.designer_analytics(date, date) from public, anon;
grant execute on function public.designer_analytics(date, date) to authenticated;
