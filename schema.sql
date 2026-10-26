-- SBMCH Student Roll Directory
-- Paste this whole file into: Supabase dashboard -> SQL Editor -> New query -> Run

create table if not exists public.students (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (char_length(full_name) between 2 and 120),
  class_roll text not null check (char_length(class_roll) between 1 and 40),
  prof_roll  text not null check (char_length(prof_roll) between 1 and 40),
  session    text check (session in ('2022-23', '2023-24', '2024-25')),
  created_at timestamptz not null default now()
);

-- Sessions: added after the first release, so it is applied separately too.
-- Re-running this whole file is safe.
alter table public.students
  add column if not exists session text check (session in ('2022-23', '2023-24', '2024-25'));

-- The same prof roll number may occur in different sessions, so uniqueness is
-- per (prof_roll, session) instead of per prof_roll alone. Dropping the old
-- single-column constraint is safe: it was stricter, so the composite one
-- always holds. Re-running this file is safe.
alter table public.students drop constraint if exists students_prof_roll_key;
alter table public.students drop constraint if exists students_roll_session_key;
alter table public.students add constraint students_roll_session_key unique (prof_roll, session);

-- Rows that were registered before the session field existed have no session.
-- Give them one (uncomment and edit), otherwise those students only see other
-- session-less rows:
-- update public.students set session = '2023-24' where session is null;

-- Only signed-in students may touch the table at all.
alter table public.students enable row level security;

-- A student may only read rows of their own session. The lookup of the
-- caller's session goes through a SECURITY DEFINER helper, because a policy
-- that queries the table it protects causes PostgreSQL error 42P17
-- (infinite recursion); the helper runs as the owner and bypasses RLS.
create or replace function public.current_student_session()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.session
  from public.students as s
  where s.user_id = auth.uid()
$$;

revoke execute on function public.current_student_session() from public, anon;
grant execute on function public.current_student_session() to authenticated;

-- New policy first, then the old one: if anything fails the old policy is
-- still in place and the site keeps working.
drop policy if exists "students_read_own_session" on public.students;
create policy "students_read_own_session"
  on public.students for select
  to authenticated
  using (session is not distinct from (select public.current_student_session()));

drop policy if exists "students_read_roster" on public.students;

drop policy if exists "students_insert_own" on public.students;
create policy "students_insert_own"
  on public.students for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "students_update_own" on public.students;
create policy "students_update_own"
  on public.students for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Optional: a quick view of the roster in roll order.
create or replace view public.roster as
  select prof_roll, full_name, class_roll
  from public.students
  order by prof_roll;

-- PostgREST exposes views too, so the view must follow the reader's own row
-- rules instead of running as its owner and showing every session.
alter view public.roster set (security_invoker = true);
