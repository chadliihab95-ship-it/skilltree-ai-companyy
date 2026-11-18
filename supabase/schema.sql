-- SKILLTREE organization-scoped schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  default_currency char(3) not null default 'DZD',
  created_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_language text not null default 'ar',
  created_at timestamptz not null default now()
);
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','manager','member','viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id,user_id)
);
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (organization_id,slug)
);
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  role text not null,
  instructions text,
  status text not null default 'idle' check(status in ('online','idle','busy','disabled')),
  created_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'medium' check(priority in ('low','medium','high','urgent')),
  status text not null default 'new' check(status in ('new','queued','running','awaiting_approval','completed','failed','cancelled')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  memory_key text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,agent_id,memory_key)
);

create index if not exists tasks_org_status_idx on public.tasks(organization_id,status);
create index if not exists logs_org_created_idx on public.activity_logs(organization_id,created_at desc);
create index if not exists agents_org_department_idx on public.agents(organization_id,department_id);

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.memberships m where m.organization_id=org_id and m.user_id=auth.uid()) $$;
create or replace function public.has_org_role(org_id uuid, allowed text[])
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.memberships m where m.organization_id=org_id and m.user_id=auth.uid() and m.role=any(allowed)) $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.departments enable row level security;
alter table public.agents enable row level security;
alter table public.tasks enable row level security;
alter table public.approvals enable row level security;
alter table public.activity_logs enable row level security;
alter table public.agent_memory enable row level security;

create policy "members read own organizations" on public.organizations for select using (public.is_org_member(id));
create policy "owners manage organizations" on public.organizations for update using (public.has_org_role(id,array['owner','admin']));
create policy "users read own profile" on public.profiles for select using (id=auth.uid());
create policy "users update own profile" on public.profiles for update using (id=auth.uid());
create policy "members read memberships" on public.memberships for select using (public.is_org_member(organization_id));
create policy "admins manage memberships" on public.memberships for all using (public.has_org_role(organization_id,array['owner','admin'])) with check (public.has_org_role(organization_id,array['owner','admin']));
create policy "members read departments" on public.departments for select using (public.is_org_member(organization_id));
create policy "managers manage departments" on public.departments for all using (public.has_org_role(organization_id,array['owner','admin','manager'])) with check (public.has_org_role(organization_id,array['owner','admin','manager']));
create policy "members read agents" on public.agents for select using (public.is_org_member(organization_id));
create policy "managers manage agents" on public.agents for all using (public.has_org_role(organization_id,array['owner','admin','manager'])) with check (public.has_org_role(organization_id,array['owner','admin','manager']));
create policy "members read tasks" on public.tasks for select using (public.is_org_member(organization_id));
create policy "members create tasks" on public.tasks for insert with check (public.is_org_member(organization_id) and created_by=auth.uid());
create policy "managers update tasks" on public.tasks for update using (public.has_org_role(organization_id,array['owner','admin','manager'])) with check (public.has_org_role(organization_id,array['owner','admin','manager']));
create policy "members read approvals" on public.approvals for select using (public.is_org_member(organization_id));
create policy "members request approvals" on public.approvals for insert with check (public.is_org_member(organization_id));
create policy "managers review approvals" on public.approvals for update using (public.has_org_role(organization_id,array['owner','admin','manager'])) with check (public.has_org_role(organization_id,array['owner','admin','manager']));
create policy "members read activity" on public.activity_logs for select using (public.is_org_member(organization_id));
create policy "members add activity" on public.activity_logs for insert with check (public.is_org_member(organization_id));
create policy "members read memory" on public.agent_memory for select using (public.is_org_member(organization_id));
create policy "managers manage memory" on public.agent_memory for all using (public.has_org_role(organization_id,array['owner','admin','manager'])) with check (public.has_org_role(organization_id,array['owner','admin','manager']));

-- IMPORTANT: create the first owner membership through a trusted server/admin SQL action.
-- Never expose the Supabase service-role key in the browser.
