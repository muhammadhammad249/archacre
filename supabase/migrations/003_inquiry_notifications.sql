begin;

alter table public.inquiries add column submission_id uuid unique;

create table public.inquiry_notifications (
  inquiry_id uuid primary key references public.inquiries (id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 6),
  available_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  claim_token uuid,
  sent_at timestamptz
);

create index studio_inquiry_notifications_due
  on public.inquiry_notifications (available_at, inquiry_id) where state = 'pending';

alter table public.inquiry_notifications enable row level security;
revoke all on public.inquiry_notifications from public, anon, authenticated, service_role;
grant select on public.inquiry_notifications to authenticated;
grant select, update on public.inquiry_notifications to service_role;

create policy studio_admin_inquiry_notifications on public.inquiry_notifications
  for select to authenticated using ((select studio_private.is_admin()));

create function studio_private.queue_inquiry_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inquiry_notifications (inquiry_id) values (new.id);
  return new;
end;
$$;

revoke all on function studio_private.queue_inquiry_notification() from public, anon, authenticated, service_role;

create trigger studio_queue_inquiry_notification
  after insert on public.inquiries for each row execute function studio_private.queue_inquiry_notification();

-- A worker owns the notification until it settles the claim or the lease expires.
create function public.claim_studio_inquiry_notifications(p_inquiry_id uuid default null, p_limit integer default 4)
returns table (
  inquiry_id uuid, claim_token uuid, attempts integer, can_send boolean,
  name text, phone text, email text, service text, city text, message text, kind text
)
language sql
security invoker
set search_path = ''
as $$
  with due as (
    select job.inquiry_id
    from public.inquiry_notifications as job
    where job.state = 'pending'
      and job.available_at <= now()
      and (p_inquiry_id is null or job.inquiry_id = p_inquiry_id)
    order by job.available_at, job.inquiry_id
    limit least(greatest(p_limit, 1), 4)
    for update skip locked
  ),
  claimed as (
    update public.inquiry_notifications as job
    set attempts = least(job.attempts + 1, 6),
        first_attempt_at = coalesce(job.first_attempt_at, now()),
        available_at = now() + interval '2 minutes',
        claim_token = gen_random_uuid()
    from due
    where job.inquiry_id = due.inquiry_id
    returning job.*
  )
  select job.inquiry_id, job.claim_token, job.attempts,
    job.attempts <= 5 and job.first_attempt_at > now() - interval '23 hours',
    inquiry.name, inquiry.phone, inquiry.email, inquiry.service, inquiry.city, inquiry.message, inquiry.kind
  from claimed as job
  join public.inquiries as inquiry on inquiry.id = job.inquiry_id;
$$;

revoke all on function public.claim_studio_inquiry_notifications(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_studio_inquiry_notifications(uuid, integer) to service_role;

commit;
