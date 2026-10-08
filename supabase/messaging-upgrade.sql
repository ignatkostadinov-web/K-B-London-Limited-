create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_role text not null check (sender_role in ('staff', 'client')),
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists project_messages_project_created_at_idx
  on public.project_messages (project_id, created_at);

alter table public.project_messages enable row level security;

drop policy if exists "staff read project messages" on public.project_messages;
create policy "staff read project messages"
  on public.project_messages for select to authenticated
  using (public.current_portal_role() = 'staff');
drop policy if exists "clients read own project messages" on public.project_messages;
create policy "clients read own project messages"
  on public.project_messages for select to authenticated
  using (project_id = public.current_portal_project_id());
drop policy if exists "project members send messages" on public.project_messages;
create policy "project members send messages"
  on public.project_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = public.current_portal_role()
    and (
      sender_role = 'staff'
      or (sender_role = 'client' and project_id = public.current_portal_project_id())
    )
  );

revoke all on public.project_messages from public, anon, authenticated;
grant select on public.project_messages to authenticated;
grant insert (project_id, sender_id, sender_role, body) on public.project_messages to authenticated;
