-- Phase 12 database migration: Add archived/deleted flags and optimistic locking support.

-- 1. Add archived column to sops
alter table public.sops add column if not exists archived boolean not null default false;
create index if not exists sops_archived_idx on public.sops(archived);

-- 2. Add deleted column to projects
alter table public.projects add column if not exists deleted boolean not null default false;
create index if not exists projects_deleted_idx on public.projects(deleted);

-- 3. Replace version function to add optimistic locking
create or replace function public.create_new_sop_version(
  p_sop_id uuid,
  p_dsl_payload jsonb,
  p_updated_by uuid,
  p_expected_version_number integer default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_current_version_number integer;
  v_new_version_number integer;
  v_version_id uuid;
begin
  -- Get current version number
  select coalesce(max(version_number), 0)
  into v_current_version_number
  from public.sop_versions
  where sop_id = p_sop_id;

  -- Verify version matches if provided (optimistic locking)
  if p_expected_version_number is not null and v_current_version_number != p_expected_version_number then
    raise exception 'VersionConflict: The SOP was modified by another session. Please reload and try again.';
  end if;

  v_new_version_number := v_current_version_number + 1;

  -- Insert the version entry
  insert into public.sop_versions (sop_id, dsl_payload, version_number, updated_by)
  values (p_sop_id, p_dsl_payload, v_new_version_number, p_updated_by)
  returning id into v_version_id;

  -- Update primary SOP record
  update public.sops
  set dsl_payload = p_dsl_payload,
      updated_at = now()
  where id = p_sop_id;

  return v_version_id;
end;
$$;
