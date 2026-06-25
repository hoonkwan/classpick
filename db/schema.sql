-- =========================================================================
-- 클래스픽 v7.1 Supabase Schema
-- Run once in Supabase Studio > SQL Editor.
-- All tables live in `public`. RLS enabled where users can write.
-- =========================================================================

-- Extensions (Supabase enables these by default, but keep idempotent)
create extension if not exists "pgcrypto";

-- =========================================================================
-- 1) profiles  — 회원 (auth.users 확장 1:1)
-- =========================================================================
create table if not exists public.profiles (
  id uuid references auth.users primary key,
  member_type text check (member_type in ('student','parent','teacher','academy','tutor','institute')),
  name text not null,
  phone text unique,
  email text unique,
  -- 학원/교습소 전용
  academy_name text,
  business_number text,
  business_verified boolean default false,
  address text,
  -- 학생/학부모 전용
  school text,
  grade text,
  child_school text,
  child_grade text,
  -- 강사 전용
  affiliation text,
  subjects text[],
  -- 공통
  tier text default 'free' check (tier in ('free','Free','standard','Standard','premium','Premium','enterprise','Enterprise')),
  tier_expires_at timestamptz,
  marketing_consent boolean default false,
  status text default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists profiles_member_type_idx on public.profiles(member_type);
create index if not exists profiles_tier_idx on public.profiles(tier);

-- =========================================================================
-- 2) courses — 강좌 (시드 + 사용자 등록)
-- =========================================================================
create table if not exists public.courses (
  id text primary key,
  city text default '부산',
  area text check (area in ('센텀','사직')),
  academy_id text,
  academy_name text not null,
  course text not null,
  subject text,
  teacher text,
  teacher_photo_url text,
  grade text,
  days text[],
  period text,
  start_time text,
  end_time text,
  time text,
  sessions text,
  school text,
  school_grade text,
  course_type text,
  months text[],
  note text,
  description text,
  price integer,
  status text default 'published' check (status in ('pending','published','hidden','archived')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists courses_academy_idx on public.courses(academy_name);
create index if not exists courses_subject_idx on public.courses(subject);
create index if not exists courses_status_idx on public.courses(status);
create index if not exists courses_school_idx on public.courses(school);
create index if not exists courses_course_type_idx on public.courses(course_type);

-- =========================================================================
-- 3) teacher_photos — 강사 사진 (1 강사 = N 사진 가능)
-- =========================================================================
create table if not exists public.teacher_photos (
  id uuid primary key default gen_random_uuid(),
  academy_id text not null,
  teacher_name text not null,
  photo_url text not null,
  object_path text,
  is_primary boolean default false,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz default now()
);

create index if not exists teacher_photos_lookup_idx on public.teacher_photos(academy_id, teacher_name);

-- =========================================================================
-- 4) sms_codes — SMS 인증코드
-- =========================================================================
create table if not exists public.sms_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  purpose text not null,
  expires_at timestamptz not null,
  consumed boolean default false,
  created_at timestamptz default now()
);

create index if not exists sms_codes_lookup_idx on public.sms_codes(phone, purpose, consumed);
create index if not exists sms_codes_expires_idx on public.sms_codes(expires_at);

-- =========================================================================
-- 5) payment_intents — 결제 의도 (사전 등록)
-- =========================================================================
create table if not exists public.payment_intents (
  order_id text primary key,
  academy_id uuid references public.profiles(id),
  tier text not null,
  amount integer not null,
  period text,
  status text default 'pending' check (status in ('pending','confirmed','cancelled','failed')),
  created_at timestamptz default now()
);

-- =========================================================================
-- 6) payments — 결제 완료
-- =========================================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id text references public.payment_intents(order_id),
  academy_id uuid references public.profiles(id),
  academy_name text,
  tier text not null,
  amount integer not null,
  period text,
  payment_key text,
  method text,
  status text default 'paid' check (status in ('paid','refunded','cancelled')),
  paid_at timestamptz default now(),
  refunded_at timestamptz
);

create index if not exists payments_academy_idx on public.payments(academy_id);
create index if not exists payments_status_idx on public.payments(status);

-- =========================================================================
-- 7) user_cart — 즐겨찾기/찜
-- =========================================================================
create table if not exists public.user_cart (
  user_id uuid references public.profiles(id),
  course_id text references public.courses(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (user_id, course_id)
);

-- =========================================================================
-- 8) course_submissions — 강좌 등록 신청 (운영자 승인 대기)
-- =========================================================================
create table if not exists public.course_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references public.profiles(id),
  payload jsonb not null,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- =========================================================================
-- 9) admin_logs — 관리자 활동 로그
-- =========================================================================
create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists admin_logs_action_idx on public.admin_logs(action);

-- =========================================================================
-- RLS POLICIES
-- =========================================================================
alter table public.profiles enable row level security;
drop policy if exists "본인 프로필 읽기" on public.profiles;
create policy "본인 프로필 읽기" on public.profiles for select using (auth.uid() = id);
drop policy if exists "본인 프로필 수정" on public.profiles;
create policy "본인 프로필 수정" on public.profiles for update using (auth.uid() = id);
drop policy if exists "프로필 생성" on public.profiles;
create policy "프로필 생성" on public.profiles for insert with check (auth.uid() = id);

alter table public.courses enable row level security;
drop policy if exists "공개 강좌 누구나 읽기" on public.courses;
create policy "공개 강좌 누구나 읽기" on public.courses for select using (status = 'published');
drop policy if exists "본인 학원 강좌 CRUD" on public.courses;
create policy "본인 학원 강좌 CRUD" on public.courses for all using (created_by = auth.uid());

alter table public.user_cart enable row level security;
drop policy if exists "본인 카트만" on public.user_cart;
create policy "본인 카트만" on public.user_cart for all using (user_id = auth.uid());

alter table public.payments enable row level security;
drop policy if exists "본인 결제만 조회" on public.payments;
create policy "본인 결제만 조회" on public.payments for select using (academy_id = auth.uid());

alter table public.teacher_photos enable row level security;
drop policy if exists "강사 사진 누구나 조회" on public.teacher_photos;
create policy "강사 사진 누구나 조회" on public.teacher_photos for select using (true);
drop policy if exists "본인 학원 강사 사진 관리" on public.teacher_photos;
create policy "본인 학원 강사 사진 관리" on public.teacher_photos for all using (uploaded_by = auth.uid());

alter table public.course_submissions enable row level security;
drop policy if exists "본인 신청만 조회" on public.course_submissions;
create policy "본인 신청만 조회" on public.course_submissions for select using (submitted_by = auth.uid());
drop policy if exists "신청 생성" on public.course_submissions;
create policy "신청 생성" on public.course_submissions for insert with check (submitted_by = auth.uid());

-- sms_codes, payment_intents, admin_logs : Service Role 전용 (RLS 켜고 정책 없음 → 익명 접근 차단)
alter table public.sms_codes enable row level security;
alter table public.payment_intents enable row level security;
alter table public.admin_logs enable row level security;

-- =========================================================================
-- STORAGE BUCKET
-- =========================================================================
insert into storage.buckets (id, name, public)
values ('teacher-photos', 'teacher-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "사진 누구나 조회" on storage.objects;
create policy "사진 누구나 조회" on storage.objects
  for select using (bucket_id = 'teacher-photos');

drop policy if exists "본인 학원만 업로드" on storage.objects;
create policy "본인 학원만 업로드" on storage.objects
  for insert with check (
    bucket_id = 'teacher-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "본인 학원만 갱신" on storage.objects;
create policy "본인 학원만 갱신" on storage.objects
  for update using (
    bucket_id = 'teacher-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "본인 학원만 삭제" on storage.objects;
create policy "본인 학원만 삭제" on storage.objects
  for delete using (
    bucket_id = 'teacher-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- =========================================================================
-- updated_at triggers
-- =========================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists courses_updated_at on public.courses;
create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();

-- =========================================================================
-- DONE
-- =========================================================================
