-- ContextSOP tenant model. Apply through the Supabase migration workflow.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now()
);

create table if not exists public.sops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null,
  dsl_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sops_organization_id_idx on public.sops(organization_id);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.sops enable row level security;

-- The JWT must contain an org_id claim. Keep the policy at the data layer.
create policy "members can read their organization" on public.organizations for select to authenticated
  using (id::text = coalesce(auth.jwt() ->> 'org_id', ''));
create policy "members can read their profile" on public.profiles for select to authenticated
  using (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''));
create policy "tenant isolation for sops" on public.sops for all to authenticated
  using (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''))
  with check (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''));

-- Custom access token hook function to inject org_id into the JWT claims
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
as $$
declare
  claims jsonb;
  org_id uuid;
begin
  -- Retrieve user's organization_id from profiles
  select organization_id into org_id from public.profiles where id = (event->>'user_id')::uuid;

  claims := event->'claims';

  if org_id is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(org_id::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Trigger function to automatically create organization and profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  org_id uuid;
  org_name text;
begin
  -- Check if user is joining an existing organization via metadata
  if new.raw_user_meta_data->>'org_id' is not null then
    org_id := (new.raw_user_meta_data->>'org_id')::uuid;
  else
    -- Create a new organization
    org_name := coalesce(new.raw_user_meta_data->>'org_name', 'My Organization');
    insert into public.organizations (name)
    values (org_name)
    returning id into org_id;
  end if;

  -- Create profile linking the user to the organization
  insert into public.profiles (id, organization_id, email, role)
  values (new.id, org_id, new.email, coalesce(new.raw_user_meta_data->>'role', 'member'));

  return new;
end;
$$;

-- Trigger to run handle_new_user when a user signs up
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


