-- SKILLTREE Core Recovery Migration — idempotent, safe to re-run.
-- Adds: profiles trigger, task_runs, ai_usage_events,
--       get_my_organization(), bootstrap_organization().

-- ============================================================
-- 1) Auto-create profile row on new auth user
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name',
                           split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill missing profiles for existing auth users
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'display_name',
                      split_part(u.email, '@', 1))
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ============================================================
-- 2) task_runs
-- ============================================================
create table if not exists public.task_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  status text not null default 'running'
    check (status in ('running','completed','failed','cancelled')),
  input jsonb not null default '{}'::jsonb,
  output text,
  error text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists task_runs_org_task_idx
  on public.task_runs(organization_id, task_id);
create index if not exists task_runs_org_created_idx
  on public.task_runs(organization_id, created_at desc);

alter table public.task_runs enable row level security;

drop policy if exists task_runs_read on public.task_runs;
create policy task_runs_read on public.task_runs
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists task_runs_insert on public.task_runs;
create policy task_runs_insert on public.task_runs
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

drop policy if exists task_runs_update on public.task_runs;
create policy task_runs_update on public.task_runs
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager']))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']));

grant select, insert, update on public.task_runs to authenticated;

-- ============================================================
-- 3) ai_usage_events
-- ============================================================
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('ceo_chat','agent_task','other')),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  billing_tier text not null default 'unknown',
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_org_created_idx
  on public.ai_usage_events(organization_id, created_at desc);
create index if not exists ai_usage_org_source_idx
  on public.ai_usage_events(organization_id, source);

alter table public.ai_usage_events enable row level security;

drop policy if exists ai_usage_read on public.ai_usage_events;
create policy ai_usage_read on public.ai_usage_events
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists ai_usage_insert on public.ai_usage_events;
create policy ai_usage_insert on public.ai_usage_events
  for insert to authenticated
  with check (public.is_org_member(organization_id) and user_id = auth.uid());

grant select, insert on public.ai_usage_events to authenticated;

-- ============================================================
-- 4) get_my_organization()
-- ============================================================
create or replace function public.get_my_organization()
returns table (organization_id uuid, organization_name text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, m.role
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;
$$;

grant execute on function public.get_my_organization() to authenticated;

-- ============================================================
-- 5) bootstrap_organization(p_name)
-- ============================================================
create or replace function public.bootstrap_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org_id uuid;
  v_slug text;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Organization name is required';
  end if;

  insert into public.profiles (id, display_name)
  values (v_user,
          split_part((select email from auth.users where id = v_user), '@', 1))
  on conflict (id) do nothing;

  v_slug := 'org-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  insert into public.organizations (name, slug)
  values (trim(p_name), v_slug)
  returning id into v_org_id;

  insert into public.memberships (organization_id, user_id, role)
  values (v_org_id, v_user, 'owner');

  insert into public.departments (organization_id, name, slug) values
    (v_org_id, 'مساعد الرئيس التنفيذي', 'ceo'),
    (v_org_id, 'الاستراتيجية',          'strategy'),
    (v_org_id, 'المالية',               'finance'),
    (v_org_id, 'التسويق',               'marketing'),
    (v_org_id, 'العمليات',              'operations'),
    (v_org_id, 'التقنية',               'technology'),
    (v_org_id, 'القانونية',             'legal')
  on conflict (organization_id, slug) do nothing;

  insert into public.agents (organization_id, department_id, name, role, instructions)
  select v_org_id, d.id, 'وكيل ' || d.name, d.slug,
         'وكيل متخصص في ' || d.name
  from public.departments d
  where d.organization_id = v_org_id
    and not exists (
      select 1 from public.agents a
      where a.organization_id = v_org_id and a.department_id = d.id
    );

  return v_org_id;
end;
$$;

grant execute on function public.bootstrap_organization(text) to authenticated;
