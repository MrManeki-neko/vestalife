create table if not exists public.board_state (
  id int primary key,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS on with no policies: only the service-role key (used server-side) can read/write.
alter table public.board_state enable row level security;
