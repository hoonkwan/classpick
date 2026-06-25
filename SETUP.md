# 클래스픽 v7.1 — Stage 2 셋업 체크리스트

Stage 1(백엔드 통합 스캐폴딩)은 코드에 반영 완료. 이 문서는 **대표님이 직접** 외부 서비스에 가입하고 키를 Vercel 환경변수에 등록하는 단계만 안내합니다. 키가 없어도 사이트는 100% 동작하므로(모든 외부 호출에 mock 폴백), 천천히 한 단계씩 진행하셔도 됩니다.

> 진행 도중 막히면 `class-pick@naver.com` 또는 GitHub Issue로 알려주세요.

---

## 1) Supabase 가입 — 15분

DB + Auth + Storage 한 번에 해결되는 백엔드 베이스.

1. https://supabase.com → **Sign up with GitHub** (hoonkwan 계정으로 OK)
2. **New Project**
   - Project name: `classpick`
   - Database password: 강력하게 (1Password 등에 보관)
   - Region: **Northeast Asia (Seoul)**
   - Plan: Free (월 500MB DB·1GB Storage·50,000 MAU)
3. 프로젝트 생성 완료까지 1~2분 대기.
4. **Project Settings → API** 메뉴에서 3개 값 메모:
   - `Project URL` → `SUPABASE_URL` 환경변수
   - `anon` `public` → `SUPABASE_ANON_KEY` 환경변수 (프론트 공개용)
   - `service_role` `secret` → `SUPABASE_SERVICE_ROLE_KEY` 환경변수 (절대 노출 금지)
5. **SQL Editor → New query** 클릭 → 로컬 `db/schema.sql` 전체 복사 → 붙여넣기 → **RUN** 클릭
6. **Storage** 메뉴에서 `teacher-photos` 버킷이 자동 생성됐는지 확인. 없으면 다시 SQL 실행.
7. (선택) **Authentication → Providers**: Email 활성화. Phone은 알리고를 별도로 쓰므로 끔.
8. (선택) **SQL Editor**에서 `db/seed.sql` 실행 → 104개 시드 강좌가 Supabase로 이전됨. (Stage 2 후반에 해도 됨. localStorage 시드가 살아있어서 사이트는 그대로 작동.)

---

## 2) 알리고 가입 — 10분 + 발신번호 등록 1일

실제 SMS 발송용 (한 건당 약 8~10원).

1. https://smartsms.aligo.in → 회원가입 (개인명의 가능)
2. 마이페이지에서 1만원 충전 → SMS 약 1,000건 가능
3. **발신번호 관리** → 개인 휴대폰 등록 → 통신사 본인인증 → 영업일 1일 이내 승인
4. 승인 후 **API 관리** 메뉴 → **API Key 발급**
5. 다음 3개 값 메모:
   - `apikey` → `ALIGO_API_KEY`
   - `user_id` (로그인 ID) → `ALIGO_USER_ID`
   - 등록된 발신번호 (예: `01012345678`) → `ALIGO_SENDER`

> 발신번호 등록이 끝나기 전까진 mock 모드로 동작. 사이트 회원가입 시 화면에 코드 `123456`이 노출되어 직접 입력하면 통과.

---

## 3) 공공데이터포털 가입 — 10분

사업자번호 진위확인용 (무료, 일일 1만건).

1. https://data.go.kr → 회원가입
2. 검색창에 **"국세청 사업자등록정보 진위확인 및 상태조회 서비스"** 입력 → **활용신청**
3. 활용 목적: "민간 플랫폼에서 입점 학원의 사업자등록 진위 확인용" 등 자유 기술
4. 보통 즉시 승인 (가끔 영업일 1일 소요)
5. **마이페이지 → 인증키 관리**에서 일반 인증키 확인
   - **Decoding** 값을 그대로 사용 (URL-decode 된 형태)
   - → `DATAGO_API_KEY`

---

## 4) 토스페이먼츠 가입 — 15분

PG. Test 모드는 개인명의로도 가능 (실제 결제는 법인 등록 후 자동 전환).

1. https://www.tosspayments.com → **개발자센터** → 회원가입
2. **내 개발 정보** 메뉴
3. **테스트 키** 2개 메모:
   - `Client Key` (test_ck_...) → `TOSS_CLIENT_KEY` (프론트 공개용)
   - `Secret Key` (test_sk_...) → `TOSS_SECRET_KEY` (서버용)
4. (법인 설립 후) **상점 가입** → 사업자등록증·통장사본 제출 → 1~3일 심사 → 실서비스 키 발급. 환경변수만 `live_ck_…`/`live_sk_…`로 교체하면 코드는 그대로 동작.

> Test 카드: **4242 4242 4242 4242** / 임의 만료일 / 임의 CVC → 항상 결제 성공.

---

## 5) Vercel 환경변수 등록 — 5분

1. https://vercel.com/dashboard → `classpick` 프로젝트
2. **Settings → Environment Variables**
3. 다음 12개 키를 등록 (각각 Production + Preview 둘 다 체크):

| 키 | 출처 |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role secret |
| `ALIGO_API_KEY` | 알리고 apikey |
| `ALIGO_USER_ID` | 알리고 user_id |
| `ALIGO_SENDER` | 알리고 발신번호 (숫자만) |
| `DATAGO_API_KEY` | 공공데이터포털 Decoding 인증키 |
| `TOSS_CLIENT_KEY` | 토스 Client Key |
| `TOSS_SECRET_KEY` | 토스 Secret Key |
| `JWT_SECRET` | 직접 생성: `openssl rand -hex 32` 결과값 (32자 hex) |
| (선택) `NEXT_PUBLIC_SUPABASE_URL` | 동일값 (혹시 Next.js 이식할 때 대비) |
| (선택) `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 동일값 |

4. 모두 입력 후 **Save** → 좌측 **Deployments** → 최신 배포의 ⋯ → **Redeploy** 클릭 (환경변수는 재배포 시 반영)

> `JWT_SECRET` 생성 명령 (Windows PowerShell): `[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))` 또는 https://www.random.org/strings/ 에서 64자 hex 생성.

---

## 6) 프론트엔드 환경변수 주입 — 자동

정적 HTML이라 빌드 치환은 불가능하므로, **부팅 시 `/api/config`를 호출**해서 anon key + Toss client key를 가져옵니다. Vercel에 키를 등록하는 즉시 자동 반영. 코드 수정 불필요.

---

## 7) 테스트 시나리오

```
□ /api/health 호출 → services 객체에 supabase:true, aligo:true, datago:true, toss:true 모두 떠야 정상
□ 회원가입 (학부모) → 본인 휴대폰으로 실제 SMS 수신 확인
□ 학원 회원가입 → 사업자번호 입력 → "유효한 사업자번호" 표시 + 상호명 자동 표시
□ Standard(50,000원) 결제 → 토스 결제창 호출 → 4242 4242 4242 4242 결제 → "결제 완료"
□ 마이페이지 → 강사 관리 → 사진 업로드 → Supabase Storage > teacher-photos 버킷에 파일 생성
□ 강사별 보기 → 해당 강사 선택 → 사진이 아바타로 표시됨
```

---

## 8) 보안 점검

- `SUPABASE_SERVICE_ROLE_KEY`, `TOSS_SECRET_KEY`, `ALIGO_API_KEY`, `DATAGO_API_KEY`, `JWT_SECRET`는 **절대 Git이나 프론트엔드에 노출되지 않아야 함**. `.gitignore`에 `.env*` 이미 추가됨.
- `SUPABASE_ANON_KEY`, `TOSS_CLIENT_KEY`만 `/api/config`를 통해 프론트로 전달됨 (둘 다 public-safe 키).
- Stage 2 진입 후 첫 1주일은 매일 `/api/health` 확인하고 Vercel Functions Logs에 빨간 에러 없는지 점검.

---

## 9) 비용 예측 (월간, 베타 단계)

| 항목 | 금액 | 비고 |
|---|---|---|
| Vercel | $0 | Hobby plan 충분 |
| Supabase | $0 | Free tier 500MB·1GB |
| 알리고 SMS | ~1만원 | 회원가입 + 인증 1,000건/월 |
| 공공데이터포털 | $0 | 무료 일일 10,000건 |
| 토스 | 결제금액 × 약 2.9% | 결제 발생 시에만 |
| 도메인 (선택) | 약 2만원/년 | `classpick.kr` |

**합계 ~ 월 1만원 + 결제 수수료.** 법인 설립 후 실서비스 전환 시 동일 가격대.

---

## 10) 자주 묻는 질문

**Q. Stage 2 진행하면 기존 회원 데이터가 사라지나요?**
A. 아니요. localStorage 데이터는 그대로 두고, 회원이 새로 가입하면 Supabase에 동기 저장됩니다. 기존 mock 회원은 그대로 작동.

**Q. 키 일부만 등록하면 어떻게 되나요?**
A. 등록된 서비스만 실제 호출, 나머진 자동으로 mock. 예: Supabase만 등록하고 토스는 미등록 → DB는 진짜 사용, 결제는 mock.

**Q. Toss test 모드로 실제 카드 결제하면 청구되나요?**
A. 아니요. Test 모드는 시뮬레이션이라 실제 청구·정산 없음. 실 청구는 live 키로 교체했을 때만.

**Q. 강사 사진을 업로드하면 강사 본인의 동의가 필요한가요?**
A. 네. 약관·방침에 명시되어 있지만, 학원이 강사 사진을 업로드할 때 본인 동의를 받았다는 체크박스를 추후 추가 권장. 강사 본인의 삭제 요청은 영업일 1일 이내 처리.
