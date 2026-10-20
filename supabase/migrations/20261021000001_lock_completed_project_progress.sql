-- Immutable progress history once the customer approves completion.
--
-- The authoritative signal already exists: projects.status = 'completed' is reached only through
-- the customer's own confirmation (app/api/projects/[id]/confirm-completion: awaiting_confirmation
-- → completed). This migration makes that state final and makes the project's progress history
-- read-only from then on, for every role and every path (API routes, direct PostgREST/REST calls,
-- the Supabase JS client) — RLS alone allowed it: project_updates_* policies check authorship only,
-- and projects_update_participant lets a participant change any column (incl. status back to
-- 'active', which would have re-opened editing).
--
-- Nothing is deleted or rewritten; existing rows, timestamps and photos stay as they are.
-- Cascade deletes (e.g. account deletion removing a request → project → its updates) still work:
-- the guards only apply while the parent project row exists.
--
-- Errors use SQLSTATE 42501 (insufficient_privilege) with the message prefix
-- 'project_progress_locked', which lib/supabase/errors.ts maps to a clear, specific message.

-- ---------------------------------------------------------------------------
-- Is this project's progress history locked? (customer-approved completion)
-- ---------------------------------------------------------------------------
create function public.project_progress_locked(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.projects p where p.id = p_project_id and p.status = 'completed');
$$;

comment on function public.project_progress_locked(uuid) is
  'True once the customer has approved the project''s completion (status = completed): its '
  'progress history is then read-only. SECURITY DEFINER so the check is never affected by the '
  'caller''s row visibility.';

revoke execute on function public.project_progress_locked(uuid) from public, anon;
grant execute on function public.project_progress_locked(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- project_updates: no add / edit / delete on a locked project
-- ---------------------------------------------------------------------------
create function public.guard_locked_project_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and public.project_progress_locked(old.project_id) then
    raise exception 'project_progress_locked: this project''s completion was approved by the customer; its progress history can no longer be changed'
      using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and public.project_progress_locked(new.project_id) then
    raise exception 'project_progress_locked: this project''s completion was approved by the customer; its progress history can no longer be changed'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger project_updates_locked_guard
  before insert or update or delete on public.project_updates
  for each row execute function public.guard_locked_project_updates();

-- ---------------------------------------------------------------------------
-- project_update_images: no adding / swapping / removing photos on a locked project
-- ---------------------------------------------------------------------------
create function public.guard_locked_project_update_images()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1 from public.project_updates u where u.id = old.update_id and public.project_progress_locked(u.project_id)
  ) then
    raise exception 'project_progress_locked: this project''s completion was approved by the customer; its progress photos can no longer be changed'
      using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and exists (
    select 1 from public.project_updates u where u.id = new.update_id and public.project_progress_locked(u.project_id)
  ) then
    raise exception 'project_progress_locked: this project''s completion was approved by the customer; its progress photos can no longer be changed'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger project_update_images_locked_guard
  before insert or update or delete on public.project_update_images
  for each row execute function public.guard_locked_project_update_images();

-- ---------------------------------------------------------------------------
-- projects: 'completed' is final — status, stage, progress and completion fields are frozen
-- (closes the bypass of a participant setting a completed project back to 'active' directly)
-- ---------------------------------------------------------------------------
create function public.guard_completed_project_final()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'completed' and (
    new.status is distinct from old.status
    or new.stage is distinct from old.stage
    or new.stages is distinct from old.stages
    or new.progress_percent is distinct from old.progress_percent
    or new.completed_at is distinct from old.completed_at
    or new.changes_requested_at is distinct from old.changes_requested_at
  ) then
    raise exception 'project_progress_locked: this project''s completion was approved by the customer; its status and progress are final'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger projects_completed_final_guard
  before update on public.projects
  for each row execute function public.guard_completed_project_final();

-- ---------------------------------------------------------------------------
-- storage: a locked project's progress photos can't be deleted by their uploader
-- (no UPDATE policy exists on this bucket, so objects already can't be overwritten)
-- ---------------------------------------------------------------------------
drop policy project_updates_owner_delete on storage.objects;
create policy project_updates_owner_delete on storage.objects
  for delete using (
    bucket_id = 'project-updates'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.files f
      join public.project_update_images pui on pui.file_id = f.id
      join public.project_updates u on u.id = pui.update_id
      where f.bucket_id = 'project-updates' and f.storage_path = storage.objects.name
        and public.project_progress_locked(u.project_id)
    )
  );
