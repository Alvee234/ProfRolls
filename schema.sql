-- SBMCH Student Roll Directory
-- Paste this whole file into: Supabase dashboard -> SQL Editor -> New query -> Run

create table if not exists public.students (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (char_length(full_name) between 2 and 120),
  class_roll text not null check (char_length(class_roll) between 1 and 40),
  prof_roll  text not null unique check (char_length(prof_roll) between 1 and 40),
  created_at timestamptz not null default now()
);

-- Only signed-in students may touch the table at all.
alter table public.students enable row level security;

drop policy if exists "students_read_roster" on public.students;
create policy "students_read_roster"
  on public.students for select
  to authenticated
  using (true);

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
