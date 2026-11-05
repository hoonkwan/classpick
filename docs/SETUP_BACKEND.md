# 클래스픽 등록·승인 백엔드 설정 (내부용)

## 구조

```
[학원]  #/register ──(anon 키: INSERT·업로드만)──▶ Supabase(클래스픽 전용)
          학원/강사/수업 + 사진(브라우저에서 3:4·webp 압축)      submissions (pending)
                                                               submission_contacts (관리자만)
                                                               storage: pending-photos (비공개)
[운영팀] #/admin ──(관리자 로그인 JWT)──▶ approve_submission / reject / set_published RPC
          미리보기 → 승인 / 수정 후 승인 / 반려 / 내리기      pub_academies·pub_teachers·pub_courses
          사진은 pending → public-photos 로 복사               storage: public-photos (공개 읽기)
[공개]  index.html ── 정적 data/*.js 로 즉시 그림 ── 비동기(4초 제한)로 pub_* (published) 합침
```

- kyin 프로젝트(`jahvkvmcefkjrrutxcvm`, 학생·결제 데이터)에는 **절대 적용하지 않는다.** 클래스픽 전용 프로젝트를 새로 만든다.
- 클라이언트에는 anon/publishable 키만. service_role 키는 어디에도 넣지 않는다 (이 설계는 service 키 없이 동작).
- `data/config.js` 가 비어 있으면: 공개 화면 = 정적 데이터만, `#/register` = 메일 신청, `#/admin` = 안내문. (localhost 에서는 모의 백엔드)

## 대표님 계정 작업 (1회)

1. https://supabase.com 로그인 → **New project**
   - Name: `classpick` · Region: Northeast Asia (Seoul) · DB 비밀번호는 안전한 곳에 보관
   - kyin 과 다른 Organization 이면 더 좋음 (분리)
2. Project Settings → **API** 에서 두 값 복사
   - Project URL (예: `https://abcd1234.supabase.co`)
   - `anon` public 키 또는 `sb_publishable_…` 키 (※ `service_role` / `sb_secret_…` 는 복사하지 않음)
3. Authentication → Providers → Email 사용, **Allow new users to sign up 끄기** (관리자는 수동 생성)
4. Authentication → Users → **Add user** → 운영팀 이메일·비밀번호로 관리자 계정 생성 → 생성된 User UID 복사
5. 아래 「적용 순서」를 실행하거나, 이 문서와 값(URL·anon 키·관리자 UID)을 개발 세션에 넘겨 주면 대신 적용

## 적용 순서 (명령)

```bash
cd "/c/학원자료/행정/10_기획부/12_클래스픽"

# 1) 마이그레이션 — Supabase 대시보드 SQL Editor 에 아래 파일 내용을 붙여 실행
#    supabase/migrations/20261106000000_classpick_submissions.sql
#    (또는 Supabase CLI: npx supabase link --project-ref <ref> && npx supabase db push)

# 2) 관리자 등록 — SQL Editor 에서
#    insert into public.admins(user_id, note) values ('<관리자 User UID>', '클래스픽 운영팀');

# 3) data/config.js 에 URL·공개키 입력 후 커밋
#    supabaseUrl: "https://<ref>.supabase.co", supabaseKey: "<anon 또는 sb_publishable 키>"

# 4) 배포 (승인 후)
git add data/config.js && git commit -m "chore: 클래스픽 백엔드 연결"
git pull --rebase origin main && git push origin main
```

## 동작 확인 (배포 후)

1. `https://classpick.vercel.app/#/register` 에서 시험 학원·강사(사진)·수업 등록 → 「승인 요청을 받았습니다」
2. 공개 화면에 아직 안 보이는지 확인
3. `https://classpick.vercel.app/#/admin` 로그인 → 대기 학원 승인 → 강사 승인 → 수업 승인
4. 해당 지역 목록에서 보이는지 확인 → 관리자 「공개 중」에서 내리기 → 바로 빠지는지 확인
5. 시험 데이터는 관리자 화면에서 내리거나 SQL 로 삭제

## 보안 설계 요약

| 대상 | anon(공개) | 관리자 |
|---|---|---|
| submissions | INSERT 만 (status=pending 강제, 허니팟 비어 있음, payload 16KB 미만, 문자열 600자 이하) | 전부 |
| submission_contacts | INSERT 만 | 전부 |
| pub_academies/teachers/courses | published 행 SELECT 만 | 전부 (RPC 로 승인·내리기) |
| storage pending-photos | 업로드만 (1MB·webp/jpeg/png, 경로 형식 검사) | 읽기·삭제 |
| storage public-photos | 공개 읽기 | 쓰기 |

- 속도 제한: 같은 IP 10분 40건 / 하루 200건 (DB 트리거, `rate_limited`)
- 강좌명 정리: DB 트리거와 클라이언트 양쪽에서 「○○T」「○○ 선생님」 제거
- 승인 RPC 는 `is_admin()` 확인 후에만 실행 (security definer), anon 실행 권한 없음
- 옛 `api/payment`, `api/sms`, `api/business`, `api/upload` 는 `CP_LEGACY_API=1` 이 아니면 404

## 남은 일 (후속)

- 관리자 로그인 세션은 1시간 — 만료되면 다시 로그인 (토큰 자동 갱신 미구현)
- 반려·승인 결과 알림은 운영팀이 담당자 연락처로 직접 안내 (자동 메일 미구현)
- 처리 끝난 신청의 IP·연락처 파기 주기 정하기 (예: 처리 후 90일)
- 정적 데이터(data/courses.js) 항목 내리기는 저장소 수정으로 처리
