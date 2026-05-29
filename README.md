# 클래스픽 (ClassPick) — v7

> 맘카페에서 듣고, 클래스픽에서 비교한다.
> 부산 센텀·사직 — 강좌 단위 사실 데이터 비교 플랫폼.

## 배포

- **라이브**: https://classpick.vercel.app
- **GitHub**: https://github.com/hoonkwan/classpick
- **자동배포**: `git push origin main` → Vercel 30초~1분 내 반영

## v7에서 새로 들어간 것

### Apple 디자인 시스템 전면 재작성
- 폰트: `-apple-system, BlinkMacSystemFont, "SF Pro Display"` + Noto Sans KR 폴백
- 컬러: `#fbfbfd` 배경 / `#1d1d1f` 본문 / `#0071e3` Apple blue 액센트
- 타이포: Hero 80~96px / Section 48~56px / Card 21~24px / Body 17px
- 컴포넌트: pill button(40px·radius 980px) / hairline 1px 카드 / backdrop-blur sticky nav
- 애니메이션: IntersectionObserver fade-up · scroll shadow · 카드 hover translateY

### 5섹션 정적 랜딩 페이지
1. **Hero** — "맘카페에서 듣고, 클래스픽에서 비교한다" + 통계 (강좌·학원·강사·동네)
2. **Why ClassPick** — 지역 사실 데이터 / 강좌 단위 비교 / 학부모 평생 무료
3. **6 view modes** — 둘러보기·카테고리·학원·강사·월별·검색
4. **Pricing** (다크 섹션) — 학부모 Free + 학원 4티어
5. **About** — 광고 가중치 없음 약속

### 4티어 입점 구독제 (시뮬레이션 결제)
| 티어 | 월 요금 | 핵심 |
|---|---|---|
| Free | 0원 | 무제한 강좌 등록 + 검색 노출 |
| Standard | 5만원 | NEW/HOT 우선 + 강사 사진/이미지/SNS |
| Premium | 17.5만원 | 메인 promo 회전 + 검색 상단 + 통계 + 문의함 |
| Enterprise | 45만원 | 키워드 점유 + 지역 1동 우선 + 전용 컨설팅 |

결제는 mock — `payments` 배열에 누적. 카드/계좌 시뮬, 7일 환불 정책 약관 명시.

### 운영자 Admin 페이지 (`/#admin`)
- 인증: `yoonhk1998` + SHA-256 해시 검증 (WebCrypto API, 평문 코드 노출 없음)
- 5회 실패 시 1분 잠금 · sessionStorage 24h 만료
- 8섹션 사이드바: 대시보드 · 결제내역 · 학원회원 · 학부모/학생 · 강사 · 강좌관리 · 공지/약관 · 시스템로그
- KPI 6개 카드 + 30일 매출 추세 SVG line chart + 티어별 도넛 + 24h 가입자
- 결제 CRUD (환불·승인) · 학원 티어 강제변경 · 회원 정지/활성화 · 강좌 삭제
- CSV 내보내기 (마스킹 옵션)

### 회원 시스템 SHA-256 마이그레이션
- `crypto.subtle.digest("SHA-256")` 비밀번호 해시
- 5타입: 학생·학부모·강사·학원·교습소
- SMS 시뮬 인증 + 사업자번호 Luhn 검증 + 약관 동의
- 시뮬 시드: 학원 8개 (Free/Standard/Premium/Enterprise 분포) · 학부모 30 · 학생 12 · 강사 10 · 결제 25건
- 시드 비밀번호: **Test1234!**

### 학원 마이페이지
- 내 강좌 (CRUD)
- 내 구독 (티어 선택 → 시뮬 결제)
- 결제 이력
- 통계 (Premium 이상)
- 학부모 문의 (Premium 이상)
- 프로필

### 학부모/학생 마이페이지
- 내 시간표 (7일 그리드 + 충돌 검사)
- 찜한 강좌
- 프로필

### 보존된 v6 기능
- 6 view modes (browse·category·byacad·byteach·bymonth·search)
- AI 자연어 검색 (10축 필터 파싱)
- 동적 신호 6종 (NEW·HOT·D-day·시즌 배너·다시 보기·인기 TOP)
- 5개 학원 약 100개 강좌 시드
- 충돌 검사 cart drawer
- 공지 modal (재노출 가능)
- 약관·방침 페이지 (본문 유지, Apple 톤 헤더/푸터)

## 파일 구조

```
C:\학원자료\클래스픽\
├─ .git/
├─ .gitignore
├─ .workspace/                         (로컬 전용)
├─ README.md                           (이 파일)
├─ index.html                          (v7 본체 — 약 3,100줄)
├─ index.v6.backup.html                (이전 버전 백업)
├─ privacy.html                        (Apple 톤 헤더, 본문 유지)
└─ terms.html                          (Apple 톤 헤더, 본문 유지)
```

## 로컬 미리보기

```bash
cd "C:\학원자료\클래스픽"
# 옵션 1: 직접 열기
start index.html
# 옵션 2: 로컬 서버
npx serve .
```

## Admin 진입

1. https://classpick.vercel.app/#admin (또는 `file://...#admin`)
2. ID: `yoonhk1998` / 비밀번호는 별도 보관 (SHA-256 해시만 코드에 존재)
3. 5회 실패 → 1분 잠금 · sessionStorage에 토큰 저장 · 탭 닫으면 자동 로그아웃

## 단계별 다음

### Phase 2 (광고/PG 직전)
- (주)클래스픽 1인 법인 설립
- 사업자등록 (정보통신업·KSIC 63120·73101)
- AdSense 연결
- 도메인 (`classpick.kr`)

### Phase 3 (영속화)
- Next.js + Supabase 이식
- 진짜 PG 연동 (현재는 mock)
- 학원 admin API

### Phase 4 (확장)
- 부산 해운대·동래로 영역 확대
- 서울 진출 검토

## 핵심 안전장치 (코드 레벨 검증)

- 운영자 익명화: 푸터·헤더 어디에도 '윤훈관' 운영자 명의 노출 없음
- 윤훈관 강좌 6개 화이트리스트 고정 (자사특목 부일1·해운대1·부일2·해운대2·부산외고2·센텀여고1)
- 정렬 우대 가중치 = 0 (교육인학원 노출 동일 기준)
- [AD] 라벨: promo-ad·인라인·풋터 광고 모두에 표시
- 공지모달: 첫 방문 1회 강제 노출 + 푸터 재호출 (구성적 통지)
- SHA-256 비밀번호 (평문 저장 X)
- Admin sessionStorage (탭 닫으면 풀림)
- 약관·방침 그대로 (법적 텍스트 보존)

## 라이선스

Private. © 2026 ClassPick.
