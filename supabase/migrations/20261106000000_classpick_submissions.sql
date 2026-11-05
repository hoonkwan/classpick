-- ═══════════════════════════════════════════════════════════════════
-- 클래스픽 전용 Supabase 프로젝트 — 공개 등록(승인 대기) + 관리자 승인 + 공개 데이터
-- ※ kyin 프로젝트(jahvkvmcefkjrrutxcvm)에 적용 금지. 클래스픽 전용 새 프로젝트에만 적용.
--
-- 권한 요약
--   anon(공개)  : submissions·submission_contacts INSERT 만 (SELECT/UPDATE/DELETE 불가)
--                 storage 'pending-photos' 업로드만 (읽기 불가, webp/jpeg/png · 1MB 이하)
--                 pub_* 테이블 status='published' 행 SELECT 만
--   관리자       : admins 테이블에 등록된 auth 사용자만 — 전부 읽기·쓰기, 승인/반려/내리기 RPC
--   service key : 클라이언트에 절대 넣지 않음 (이 설계는 service key 없이 동작)
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── 관리자 ──────────────────────────────────────────────
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create policy admins_self_read on public.admins for select to authenticated using (user_id = auth.uid());

-- ── 승인 대기 (공개 INSERT 전용) ─────────────────────────
-- kind: academy | teacher | course       op: create | edit
-- batch_id: 한 번에 제출한 학원·강사·수업 묶음
-- ref     : 같은 묶음 안에서 서로를 가리키는 임시 키 (강사 ref ↔ 수업 payload.teacher_ref)
-- target_id: 수정 요청일 때 고칠 공개 항목 id
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  kind text not null check (kind in ('academy','teacher','course')),
  op text not null default 'create' check (op in ('create','edit')),
  ref text,
  target_id text,
  payload jsonb not null,
  photo_path text,                         -- pending-photos 안 경로 (강사 사진·학원 로고)
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason text,
  published_id text,                       -- 승인 후 공개 테이블 id
  client_ip text,                          -- 속도 제한용 (관리자만 열람)
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
create index if not exists submissions_status_idx on public.submissions(status, kind, created_at desc);
create index if not exists submissions_batch_idx on public.submissions(batch_id);
create index if not exists submissions_ip_idx on public.submissions(client_ip, created_at desc);
alter table public.submissions enable row level security;

-- 담당자 연락처는 별도 테이블 — 관리자만 열람 (개인정보 최소 수집: 이름·전화·이메일)
create table if not exists public.submission_contacts (
  batch_id uuid primary key,
  contact_name text check (char_length(contact_name) <= 40),
  contact_phone text check (char_length(contact_phone) <= 30),
  contact_email text check (char_length(contact_email) <= 120),
  created_at timestamptz not null default now()
);
alter table public.submission_contacts enable row level security;

-- 공개 INSERT: 대기 상태·크기 제한·허니팟 비어 있음만 허용
create policy submissions_public_insert on public.submissions for insert to anon, authenticated
  with check (
    status = 'pending' and reject_reason is null and published_id is null and decided_at is null
    and pg_column_size(payload) < 16000
    and coalesce(payload->>'website','') = ''           -- 허니팟
    and (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$')
  );
create policy contacts_public_insert on public.submission_contacts for insert to anon, authenticated with check (true);

create policy submissions_admin_all on public.submissions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy contacts_admin_all on public.submission_contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 속도 제한 + 서버측 검증 (트리거) — IP 당 10분 40행 / 하루 200행, 문자열 길이 제한
create or replace function public.submissions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hdr json;
  ip text;
  n10 int; nday int;
begin
  if public.is_admin() then return new; end if;
  begin
    hdr := current_setting('request.headers', true)::json;
    ip := split_part(coalesce(hdr->>'x-forwarded-for', hdr->>'x-real-ip', 'unknown'), ',', 1);
  exception when others then ip := 'unknown';
  end;
  new.client_ip := left(ip, 64);
  new.status := 'pending'; new.reject_reason := null; new.published_id := null; new.decided_at := null; new.decided_by := null;
  select count(*) into n10 from public.submissions where client_ip = new.client_ip and created_at > now() - interval '10 minutes';
  select count(*) into nday from public.submissions where client_ip = new.client_ip and created_at > now() - interval '1 day';
  if n10 >= 40 or nday >= 200 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  -- 문자열 필드 길이 제한
  if exists (select 1 from jsonb_each_text(new.payload) e where char_length(e.value) > 600) then
    raise exception 'field_too_long' using errcode = 'P0001';
  end if;
  -- 강좌명·강사 정보 정리: 강좌명에서 「○○T」「○○ 선생님」 제거
  if new.kind = 'course' and new.payload ? 'name' then
    new.payload := jsonb_set(new.payload, '{name}', to_jsonb(trim(regexp_replace(
      regexp_replace(new.payload->>'name', '[[:space:]–·(-]*[가-힣]{2,4}[[:space:]]*(T|쌤|선생님)\)?(?=[[:space:]/·,)-]|$)', ' ', 'g'),
      '[[:space:]]{2,}', ' ', 'g'))));
  end if;
  return new;
end $$;
drop trigger if exists submissions_guard_trg on public.submissions;
create trigger submissions_guard_trg before insert on public.submissions for each row execute function public.submissions_guard();

-- ── 공개 데이터 (승인된 것만 published) ──────────────────
create table if not exists public.pub_academies (
  id text primary key,
  name text not null,
  branch text default '',
  area text not null check (area in ('센텀','사직')),
  region text generated always as (case area when '센텀' then 'centum' else 'sajik' end) stored,
  logo_url text default '',
  site text default '',
  status text not null default 'published' check (status in ('published','hidden')),
  updated_at timestamptz not null default now()
);
create table if not exists public.pub_teachers (
  id text primary key,
  academy_id text references public.pub_academies(id) on delete set null,
  name text not null,
  subject text default '',
  quote text default '',
  bio text default '',
  photo_url text default '',
  status text not null default 'published' check (status in ('published','hidden')),
  updated_at timestamptz not null default now()
);
create table if not exists public.pub_courses (
  id text primary key,
  academy_id text not null,               -- pub_academies.id 또는 정적 학원 id (예: eduin-centum)
  area text not null check (area in ('센텀','사직')),
  subject text not null,
  prog text default '',
  name text not null,
  target text default '',
  grade text default '',
  school text default '',
  level text default '',
  sections jsonb not null default '[]',   -- [{l:"", t:["월 17:00-20:00"]}]  (data/courses.js 와 같은 모양)
  freq text default '',
  content text default '',
  teacher text default '',
  start_text text default '',
  months int[] default '{}',
  status text not null default 'published' check (status in ('published','hidden')),
  updated_at timestamptz not null default now()
);
alter table public.pub_academies enable row level security;
alter table public.pub_teachers enable row level security;
alter table public.pub_courses enable row level security;
create policy pub_academies_read on public.pub_academies for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy pub_teachers_read on public.pub_teachers for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy pub_courses_read on public.pub_courses for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy pub_academies_admin on public.pub_academies for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pub_teachers_admin on public.pub_teachers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pub_courses_admin on public.pub_courses for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── 관리 기록 ───────────────────────────────────────────
create table if not exists public.admin_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  admin uuid,
  action text not null,
  target text,
  detail jsonb
);
alter table public.admin_log enable row level security;
create policy admin_log_admin on public.admin_log for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── 승인 / 반려 / 내리기 RPC (관리자만) ──────────────────
-- p_edits: 관리자가 고친 payload (null 이면 제출본 그대로)
-- p_photo_url: 공개 버킷으로 옮긴 사진 주소 (클라이언트가 복사 후 전달)
create or replace function public.approve_submission(p_id uuid, p_edits jsonb default null, p_photo_url text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  s public.submissions;
  pl jsonb;
  pid text;
  acad text;
  area_v text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.submissions where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if s.status <> 'pending' then raise exception 'already_decided'; end if;
  pl := coalesce(p_edits, s.payload);

  if s.kind = 'academy' then
    pid := coalesce(s.target_id, 'ac-' || substr(replace(s.id::text,'-',''),1,10));
    insert into public.pub_academies(id,name,branch,area,logo_url,site,status,updated_at)
    values (pid, pl->>'name', coalesce(pl->>'branch',''), pl->>'area', coalesce(p_photo_url, pl->>'logo_url',''), coalesce(pl->>'site',''), 'published', now())
    on conflict (id) do update set name=excluded.name, branch=excluded.branch, area=excluded.area,
      logo_url=case when excluded.logo_url<>'' then excluded.logo_url else pub_academies.logo_url end,
      site=excluded.site, status='published', updated_at=now();

  elsif s.kind = 'teacher' then
    acad := coalesce(pl->>'academy_id', (select published_id from public.submissions where batch_id = s.batch_id and kind='academy' and status='approved' limit 1));
    pid := coalesce(s.target_id, 'tc-' || substr(replace(s.id::text,'-',''),1,10));
    insert into public.pub_teachers(id,academy_id,name,subject,quote,bio,photo_url,status,updated_at)
    values (pid, acad, pl->>'name', coalesce(pl->>'subject',''), coalesce(pl->>'quote',''), coalesce(pl->>'bio',''), coalesce(p_photo_url,''), 'published', now())
    on conflict (id) do update set academy_id=excluded.academy_id, name=excluded.name, subject=excluded.subject, quote=excluded.quote, bio=excluded.bio,
      photo_url=case when excluded.photo_url<>'' then excluded.photo_url else pub_teachers.photo_url end, status='published', updated_at=now();

  else -- course
    acad := coalesce(pl->>'academy_id', (select published_id from public.submissions where batch_id = s.batch_id and kind='academy' and status='approved' limit 1));
    if acad is null then raise exception 'academy_not_approved'; end if;
    area_v := coalesce(pl->>'area', (select area from public.pub_academies where id = acad));
    pid := coalesce(s.target_id, 'cs-' || substr(replace(s.id::text,'-',''),1,10));
    insert into public.pub_courses(id,academy_id,area,subject,prog,name,target,grade,school,level,sections,freq,content,teacher,start_text,months,status,updated_at)
    values (pid, acad, area_v, pl->>'subject', coalesce(pl->>'prog',''), pl->>'name', coalesce(pl->>'target',''), coalesce(pl->>'grade',''),
      coalesce(pl->>'school',''), coalesce(pl->>'level',''), coalesce(pl->'sections','[]'::jsonb), coalesce(pl->>'freq',''), coalesce(pl->>'content',''),
      coalesce(pl->>'teacher',''), coalesce(pl->>'start',''),
      coalesce((select array_agg(v::int) from jsonb_array_elements_text(coalesce(pl->'months','[]'::jsonb)) v), '{}'), 'published', now())
    on conflict (id) do update set academy_id=excluded.academy_id, area=excluded.area, subject=excluded.subject, prog=excluded.prog, name=excluded.name,
      target=excluded.target, grade=excluded.grade, school=excluded.school, level=excluded.level, sections=excluded.sections, freq=excluded.freq,
      content=excluded.content, teacher=excluded.teacher, start_text=excluded.start_text, months=excluded.months, status='published', updated_at=now();
  end if;

  update public.submissions set status='approved', payload=pl, published_id=pid, decided_at=now(), decided_by=auth.uid() where id = p_id;
  insert into public.admin_log(admin,action,target,detail) values (auth.uid(),'approve',s.kind||':'||pid, jsonb_build_object('submission',p_id));
  return pid;
end $$;

create or replace function public.reject_submission(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.submissions set status='rejected', reject_reason=left(coalesce(p_reason,''),300), decided_at=now(), decided_by=auth.uid()
   where id = p_id and status='pending';
  insert into public.admin_log(admin,action,target,detail) values (auth.uid(),'reject',p_id::text, jsonb_build_object('reason',p_reason));
end $$;

-- 내리기(takedown) 즉시 / 다시 올리기
create or replace function public.set_published(p_kind text, p_id text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind = 'academy' then update public.pub_academies set status = case when p_on then 'published' else 'hidden' end, updated_at=now() where id = p_id;
  elsif p_kind = 'teacher' then update public.pub_teachers set status = case when p_on then 'published' else 'hidden' end, updated_at=now() where id = p_id;
  else update public.pub_courses set status = case when p_on then 'published' else 'hidden' end, updated_at=now() where id = p_id; end if;
  insert into public.admin_log(admin,action,target) values (auth.uid(), case when p_on then 'publish' else 'takedown' end, p_kind||':'||p_id);
end $$;

revoke all on function public.approve_submission(uuid,jsonb,text) from public, anon;
revoke all on function public.reject_submission(uuid,text) from public, anon;
revoke all on function public.set_published(text,text,boolean) from public, anon;
grant execute on function public.approve_submission(uuid,jsonb,text) to authenticated;
grant execute on function public.reject_submission(uuid,text) to authenticated;
grant execute on function public.set_published(text,text,boolean) to authenticated;

-- 테이블 권한 (RLS 와 함께): anon 은 INSERT 만, 공개 테이블은 SELECT 만
revoke all on public.submissions, public.submission_contacts, public.admins, public.admin_log from anon;
grant insert on public.submissions, public.submission_contacts to anon;
revoke all on public.pub_academies, public.pub_teachers, public.pub_courses from anon;
grant select on public.pub_academies, public.pub_teachers, public.pub_courses to anon;
grant select, insert, update, delete on public.submissions, public.submission_contacts, public.pub_academies, public.pub_teachers, public.pub_courses, public.admin_log to authenticated;
grant select on public.admins to authenticated;

-- ── Storage ────────────────────────────────────────────
-- pending-photos: 공개 업로드만 (읽기 불가) · 1MB · webp/jpeg/png  (Supabase 가 서버측에서 크기·형식 검증)
-- public-photos : 공개 읽기 · 관리자만 쓰기 (승인 시 관리자 화면이 pending → public 으로 복사)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pending-photos','pending-photos', false, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=1048576, allowed_mime_types=array['image/webp','image/jpeg','image/png'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-photos','public-photos', true, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public=true, file_size_limit=1048576, allowed_mime_types=array['image/webp','image/jpeg','image/png'];

create policy pending_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'pending-photos' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$');
create policy pending_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'pending-photos' and public.is_admin());
create policy pending_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'pending-photos' and public.is_admin());
create policy public_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'public-photos' and public.is_admin());
create policy public_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'public-photos' and public.is_admin());
create policy public_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'public-photos' and public.is_admin());
