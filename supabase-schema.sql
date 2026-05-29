create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  practice_date date not null,
  points integer not null default 0,
  correct_notes integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, practice_date)
);

drop table if exists public.note_attempts;

alter table public.profiles enable row level security;
alter table public.daily_progress enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id);

drop policy if exists "Users can read own daily progress" on public.daily_progress;
create policy "Users can read own daily progress"
on public.daily_progress for select
using (auth.uid() = user_id);

drop policy if exists "Users can create own daily progress" on public.daily_progress;
create policy "Users can create own daily progress"
on public.daily_progress for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own daily progress" on public.daily_progress;
create policy "Users can update own daily progress"
on public.daily_progress for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.add_daily_points(point_delta integer, correct_delta integer)
returns public.daily_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  today date := current_date;
  saved_row public.daily_progress;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.daily_progress as progress (
    user_id,
    practice_date,
    points,
    correct_notes,
    updated_at
  )
  values (
    current_user_id,
    today,
    point_delta,
    correct_delta,
    now()
  )
  on conflict (user_id, practice_date)
  do update set
    points = progress.points + excluded.points,
    correct_notes = progress.correct_notes + excluded.correct_notes,
    updated_at = now()
  returning * into saved_row;

  return saved_row;
end;
$$;
