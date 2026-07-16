-- Phase 6 database migration: Projects, Versioning, Executions, RLS and search indexing.

-- 1. Create the projects table
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  created_at timestamptz not null default now()
);

-- 2. Alter sops table to add description, project_id, and original_transcript_id
alter table public.sops 
  add column if not exists description text,
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists original_transcript_id text;

-- 3. Create the sop_versions table
create table if not exists public.sop_versions (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sops(id) on delete cascade,
  dsl_payload jsonb not null,
  version_number integer not null check (version_number >= 1),
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- 4. Create the sop_executions table
create table if not exists public.sop_executions (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sops(id) on delete cascade,
  executed_by uuid not null references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  variable_state jsonb not null default '{}'::jsonb,
  completed_steps text[] not null default '{}'::text[],
  status text not null check (status in ('running', 'completed', 'failed', 'aborted')),
  created_at timestamptz not null default now()
);

-- 5. Indexing Architecture
create index if not exists projects_organization_id_idx on public.projects(organization_id);
create index if not exists sops_project_id_idx on public.sops(project_id);
create index if not exists sop_versions_sop_id_idx on public.sop_versions(sop_id);
create index if not exists sop_executions_sop_id_idx on public.sop_executions(sop_id);
create index if not exists sop_executions_organization_id_idx on public.sop_executions(organization_id);

-- Full-Text Search indexing on title and description
create index if not exists sops_fts_idx on public.sops using gin (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);

-- 6. Row-Level Security Rules
alter table public.projects enable row level security;
alter table public.sop_versions enable row level security;
alter table public.sop_executions enable row level security;

-- Projects Policy
create policy "tenant isolation for projects" on public.projects for all to authenticated
  using (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''))
  with check (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''));

-- SOP Versions Policy
create policy "tenant isolation for sop_versions" on public.sop_versions for all to authenticated
  using (
    exists (
      select 1 from public.sops
      where sops.id = sop_versions.sop_id
      and sops.organization_id::text = coalesce(auth.jwt() ->> 'org_id', '')
    )
  )
  with check (
    exists (
      select 1 from public.sops
      where sops.id = sop_versions.sop_id
      and sops.organization_id::text = coalesce(auth.jwt() ->> 'org_id', '')
    )
  );

-- SOP Executions Policy
create policy "tenant isolation for sop_executions" on public.sop_executions for all to authenticated
  using (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''))
  with check (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''));

-- 7. Transactional Stored Procedure for SOP updates
create or replace function public.create_new_sop_version(
  p_sop_id uuid,
  p_dsl_payload jsonb,
  p_updated_by uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_new_version_number integer;
  v_version_id uuid;
begin
  -- Get next version number
  select coalesce(max(version_number), 0) + 1
  into v_new_version_number
  from public.sop_versions
  where sop_id = p_sop_id;

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
