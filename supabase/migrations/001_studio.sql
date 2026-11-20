begin;

create schema studio_private;
revoke all on schema studio_private from public, anon, authenticated, service_role;
grant usage on schema studio_private to authenticated, service_role;

create table studio_private.studio_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table studio_private.studio_admins enable row level security;

create function studio_private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from studio_private.studio_admins
    where user_id = (select auth.uid())
  );
$$;

create function studio_private.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
    and studio_private.is_member();
$$;

-- Exposed wrappers can only inspect the identity of the current caller.
create function public.is_studio_member()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select studio_private.is_member();
$$;

create function public.is_studio_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select studio_private.is_admin();
$$;

revoke all on function studio_private.is_member(), studio_private.is_admin(),
  public.is_studio_member(), public.is_studio_admin()
  from public, anon, authenticated, service_role;
grant execute on function studio_private.is_member(), studio_private.is_admin(),
  public.is_studio_member(), public.is_studio_admin()
  to authenticated;

create function studio_private.media_id(p_url text)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_url ~ '^/media/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
      then substr(p_url, 8)::uuid
  end;
$$;

create function studio_private.valid_project_image(p_url text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select char_length(p_url) <= 2048 and (
    p_url ~ '^https://[^[:space:]]+$'
    or (p_url ~ '^/?assets/[A-Za-z0-9][A-Za-z0-9_./-]*$' and strpos(p_url, '..') = 0)
    or studio_private.media_id(p_url) is not null
  );
$$;

revoke all on function studio_private.media_id(text), studio_private.valid_project_image(text)
  from public, anon, authenticated, service_role;
grant execute on function studio_private.media_id(text), studio_private.valid_project_image(text)
  to authenticated;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) <= 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  description text not null default '' check (char_length(description) <= 24000),
  category text not null default 'Architecture' check (char_length(btrim(category)) between 1 and 100),
  location text not null default '' check (char_length(location) <= 200),
  completion_date date,
  area text not null default '' check (char_length(area) <= 100),
  cover_image text not null default '' check (cover_image = '' or studio_private.valid_project_image(cover_image)),
  gallery text[] not null default '{}' check (cardinality(gallery) <= 32 and coalesce(array_ndims(gallery), 1) = 1),
  featured boolean not null default false,
  sort_order integer not null default 0,
  seo_title text not null default '' check (char_length(seo_title) <= 160),
  seo_description text not null default '' check (char_length(seo_description) <= 400),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index studio_projects_published_order
  on public.projects (sort_order, created_at, id) where status = 'published';
create index studio_projects_recent on public.projects (updated_at desc);

create table public.site_content (
  key text primary key check (key ~ '^[a-z][a-z0-9_-]{0,39}$'),
  value jsonb not null check (octet_length(value::text) <= 262144),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  phone text not null default '' check (char_length(phone) <= 50),
  email text not null default '' check (char_length(email) <= 254),
  service text not null default '' check (char_length(service) <= 160),
  city text not null default '' check (char_length(city) <= 160),
  message text not null check (char_length(btrim(message)) between 1 and 8000),
  kind text not null default 'inquiry' check (kind in ('inquiry', 'project', 'quote')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'replied', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index studio_inquiries_recent on public.inquiries (created_at desc);
create index studio_inquiries_status on public.inquiries (status, created_at desc);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  path text not null unique check (
    char_length(path) <= 250 and path ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
    and strpos(path, '..') = 0 and strpos(path, '//') = 0
  ),
  filename text not null check (char_length(btrim(filename)) between 1 and 255),
  mime_type text not null check (mime_type in ('image/webp', 'image/jpeg', 'image/png', 'image/avif')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, active)
);
create index studio_media_recent on public.media_assets (created_at desc);

-- Foreign keys serialize attachment and removal, including concurrent writes.
create table studio_private.project_media (
  project_id uuid references public.projects (id) on delete cascade,
  media_id uuid not null,
  requires_active boolean not null default true check (requires_active),
  primary key (project_id, media_id),
  foreign key (media_id, requires_active) references public.media_assets (id, active)
);
create index studio_project_media_lookup on studio_private.project_media (media_id);

create table studio_private.content_media (
  content_key text references public.site_content (key) on delete cascade on update cascade,
  media_id uuid not null,
  requires_active boolean not null default true check (requires_active),
  primary key (content_key, media_id),
  foreign key (media_id, requires_active) references public.media_assets (id, active)
);
create index studio_content_media_lookup on studio_private.content_media (media_id);

create function studio_private.sync_project_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(new.gallery) as image(url)
    where studio_private.valid_project_image(image.url) is not true
  ) then
    raise exception 'Invalid project gallery image URL' using errcode = '22023';
  end if;

  delete from studio_private.project_media where project_id = new.id;
  insert into studio_private.project_media (project_id, media_id)
  select distinct new.id, image_id
  from unnest(array_prepend(new.cover_image, new.gallery)) as image(url)
  cross join lateral studio_private.media_id(image.url) as media(image_id)
  where image_id is not null;
  return null;
end;
$$;

create function studio_private.sync_content_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from studio_private.content_media where content_key = new.key;
  insert into studio_private.content_media (content_key, media_id)
  select distinct new.key, image_id
  from jsonb_path_query(new.value, 'strict $.** ? (@.type() == "string")') as item(entry)
  cross join lateral studio_private.media_id(item.entry #>> '{}') as media(image_id)
  where image_id is not null;
  return null;
end;
$$;

revoke all on function studio_private.sync_project_media(), studio_private.sync_content_media()
  from public, anon, authenticated, service_role;
create trigger studio_project_media_sync after insert or update of cover_image, gallery
  on public.projects for each row execute function studio_private.sync_project_media();
create trigger studio_content_media_sync after insert or update of value
  on public.site_content for each row execute function studio_private.sync_content_media();

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null check (table_name in ('projects', 'site_content', 'inquiries', 'media_assets')),
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  record_id text not null,
  created_at timestamptz not null default now()
);
create index studio_audit_recent on public.audit_events (created_at desc);

create function studio_private.audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_row jsonb;
begin
  if tg_op = 'DELETE' then
    changed_row := to_jsonb(old);
  else
    changed_row := to_jsonb(new);
  end if;

  insert into public.audit_events (actor_id, table_name, operation, record_id)
  values (auth.uid(), tg_table_name, tg_op, coalesce(changed_row ->> 'id', changed_row ->> 'key'));
  return null;
end;
$$;

create function studio_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function studio_private.audit_change(), studio_private.set_updated_at()
  from public, anon, authenticated, service_role;

do $$
declare
  relation text;
begin
  foreach relation in array array['projects', 'site_content', 'inquiries', 'media_assets']
  loop
    execute format(
      'create trigger studio_update_timestamp before update on public.%I for each row execute function studio_private.set_updated_at()',
      relation
    );
    execute format(
      'create trigger studio_audit_changes after insert or update or delete on public.%I for each row execute function studio_private.audit_change()',
      relation
    );
  end loop;
end;
$$;

create table public.analytics_daily (
  path text not null check (char_length(path) <= 160 and path ~ '^/[a-z0-9._/-]*$'),
  day date not null,
  views bigint not null default 0 check (views >= 0),
  primary key (day, path)
);

create table studio_private.rate_limits (
  key text primary key,
  expires_at timestamptz not null,
  hits integer not null check (hits >= 1)
);
create index studio_rate_limits_expiry on studio_private.rate_limits (expires_at);

create function public.consume_studio_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  checked_at timestamptz := clock_timestamp();
  allowed boolean;
begin
  if char_length(p_key) not between 1 and 200 or p_key is null
      or p_limit not between 1 and 10000 or p_limit is null
      or p_window_seconds not between 1 and 86400 or p_window_seconds is null then
    raise exception 'Invalid rate limit parameters' using errcode = '22023';
  end if;

  -- Bound cleanup work and skip buckets in use by another request.
  delete from studio_private.rate_limits
  where key in (
    select key from studio_private.rate_limits
    where expires_at < checked_at - interval '1 hour'
    order by expires_at
    limit 50
    for update skip locked
  );

  insert into studio_private.rate_limits as limits (key, expires_at, hits)
  values (p_key, checked_at + make_interval(secs => p_window_seconds), 1)
  on conflict (key) do update
  set expires_at = case when limits.expires_at <= checked_at then excluded.expires_at else limits.expires_at end,
      hits = case when limits.expires_at <= checked_at then 1 else limits.hits + 1 end
  where limits.expires_at <= checked_at or limits.hits < p_limit
  returning true into allowed;

  return coalesce(allowed, false);
end;
$$;

create function public.record_studio_page_view(p_path text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.analytics_daily as analytics (path, day, views)
  values (p_path, timezone('UTC', now())::date, 1)
  on conflict (day, path) do update set views = analytics.views + 1;
$$;

create function public.studio_media_is_public(p_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.media_assets as asset
    where asset.id = p_id and asset.active and (
      exists (
        select 1 from studio_private.project_media as link
        join public.projects as project on project.id = link.project_id
        where link.media_id = asset.id and project.status = 'published'
      )
      or exists (
        select 1 from studio_private.content_media as link
        join public.site_content as content on content.key = link.content_key
        where link.media_id = asset.id and content.is_published and content.key in (
          'homepage', 'about', 'services', 'portfolio', 'testimonials', 'blog', 'team',
          'contact', 'socials', 'footer', 'navigation', 'seo', 'categories'
        )
      )
    )
  );
$$;

revoke all on function public.consume_studio_rate_limit(text, integer, integer),
  public.record_studio_page_view(text), public.studio_media_is_public(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_studio_rate_limit(text, integer, integer),
  public.record_studio_page_view(text), public.studio_media_is_public(uuid) to service_role;

alter table public.projects enable row level security;
alter table public.site_content enable row level security;
alter table public.inquiries enable row level security;
alter table public.media_assets enable row level security;
alter table public.audit_events enable row level security;
alter table public.analytics_daily enable row level security;
alter table studio_private.project_media enable row level security;
alter table studio_private.content_media enable row level security;
alter table studio_private.rate_limits enable row level security;

revoke all on all tables in schema studio_private from public, anon, authenticated, service_role;
grant select on studio_private.project_media, studio_private.content_media to service_role;
grant select, insert, update, delete on studio_private.rate_limits to service_role;

revoke all on table public.projects, public.site_content, public.inquiries,
  public.media_assets, public.audit_events, public.analytics_daily
  from public, anon, authenticated, service_role;
grant select on public.projects, public.site_content to anon, authenticated, service_role;
grant insert, update, delete on public.projects, public.site_content to authenticated;
grant select, update, delete on public.inquiries to authenticated;
grant select, insert on public.inquiries to service_role;
grant select, insert, update, delete on public.media_assets to authenticated;
grant select on public.media_assets to service_role;
grant select on public.audit_events, public.analytics_daily to authenticated;
grant select, insert, update on public.analytics_daily to service_role;

create policy studio_published_projects on public.projects for select to anon, authenticated
  using (status = 'published');
create policy studio_admin_projects on public.projects for all to authenticated
  using ((select studio_private.is_admin())) with check ((select studio_private.is_admin()));

create policy studio_published_content on public.site_content for select to anon, authenticated
  using (
    is_published and key in (
      'homepage', 'about', 'services', 'portfolio', 'testimonials', 'blog', 'team',
      'contact', 'socials', 'footer', 'navigation', 'seo', 'categories'
    )
  );
create policy studio_admin_content on public.site_content for all to authenticated
  using ((select studio_private.is_admin())) with check ((select studio_private.is_admin()));

create policy studio_admin_inquiries on public.inquiries for all to authenticated
  using ((select studio_private.is_admin())) with check ((select studio_private.is_admin()));
create policy studio_admin_media on public.media_assets for all to authenticated
  using ((select studio_private.is_admin())) with check ((select studio_private.is_admin()));
create policy studio_admin_audit on public.audit_events for select to authenticated
  using ((select studio_private.is_admin()));
create policy studio_admin_analytics on public.analytics_daily for select to authenticated
  using ((select studio_private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-media', 'studio-media', false, 10485760, array['image/webp', 'image/jpeg', 'image/png', 'image/avif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function studio_private.can_remove_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select studio_private.is_admin()
    and not exists (select 1 from public.media_assets where path = p_name and active);
$$;

revoke all on function studio_private.can_remove_storage_object(text) from public, anon, authenticated, service_role;
grant execute on function studio_private.can_remove_storage_object(text) to authenticated;

create policy studio_storage_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-media' and (select studio_private.is_admin()));
create policy studio_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'studio-media' and (select studio_private.is_admin()));
create policy studio_storage_remove on storage.objects for delete to authenticated
  using (bucket_id = 'studio-media' and studio_private.can_remove_storage_object(name));

commit;
