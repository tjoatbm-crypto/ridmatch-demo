-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- After running, enable Email auth in Authentication → Providers if you use sign in/up.

-- Profiles: extends Supabase Auth (name, phone, default pickup for autofill)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text default '',
  phone text default '',
  pickup_location text default '',
  created_at timestamptz default now()
);

-- Events (crowdsourced)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date text not null,
  time text default '',
  end_time text default '',
  location text default '',
  created_at timestamptz default now()
);

-- Drivers (offer rides)
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  phone text not null,
  seats int not null default 1,
  notes text default '',
  created_at timestamptz default now()
);

-- Students (need rides)
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  phone text not null,
  pickup text not null default '',
  notes text default '',
  created_at timestamptz default now()
);

-- Matches (driver + student for an event)
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz default now(),
  unique(driver_id, student_id, event_id)
);

-- Row Level Security: allow read for all, insert/update as needed
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.drivers enable row level security;
alter table public.students enable row level security;
alter table public.matches enable row level security;

-- Profiles: users can read/update their own
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Events: anyone can read and insert (crowdsourced)
create policy "Anyone can read events" on public.events for select using (true);
create policy "Anyone can insert events" on public.events for insert with check (true);

-- Drivers: anyone can read; anyone can insert (anon or authenticated)
create policy "Anyone can read drivers" on public.drivers for select using (true);
create policy "Anyone can insert drivers" on public.drivers for insert with check (true);

-- Students: anyone can read and insert
create policy "Anyone can read students" on public.students for select using (true);
create policy "Anyone can insert students" on public.students for insert with check (true);

-- Matches: anyone can read and insert
create policy "Anyone can read matches" on public.matches for select using (true);
create policy "Anyone can insert matches" on public.matches for insert with check (true);

-- Trigger: create profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, phone, pickup_location)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'pickup_location', '')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Optional: seed a few events (run if you want starter data)
-- insert into public.events (name, date, time, location) values
--   ('Spring Band Concert', '2025-03-15', '6:00 PM', 'Main Auditorium'),
--   ('Science Fair', '2025-03-22', '2:00 PM', 'Gym & Cafeteria'),
--   ('Field Day', '2025-04-05', '9:00 AM', 'Sports Field'),
--   ('Parent-Teacher Night', '2025-04-12', '5:30 PM', 'Classrooms');
