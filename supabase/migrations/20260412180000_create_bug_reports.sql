create extension if not exists pgcrypto;

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  hostname text not null check (char_length(hostname) between 1 and 255),
  url text not null check (char_length(url) between 1 and 2048),
  mode text not null check (mode in ('balanced', 'visual_only', 'strict_reject')),
  outcome_label text not null,
  detected_banner text not null,
  extension_version text not null,
  browser_version text not null,
  report_text text not null,
  status text not null default 'new' check (status in ('new', 'reviewed', 'duplicate', 'promoted', 'closed')),
  internal_notes text not null default ''
);

create index if not exists bug_reports_created_at_idx
  on public.bug_reports (created_at desc);

create index if not exists bug_reports_hostname_idx
  on public.bug_reports (hostname);

create index if not exists bug_reports_status_idx
  on public.bug_reports (status, created_at desc);

alter table public.bug_reports enable row level security;
