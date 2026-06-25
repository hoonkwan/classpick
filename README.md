# 교육인학원 시간표 사이트 — v9

> 부산 센텀점·사직점 교육인학원의 한 학기 강좌·강사·시간표를
> **한 페이지에 정리한 자체 안내 사이트**입니다.

## 라이브 / 배포

- **라이브**: https://classpick.vercel.app
- **GitHub**: https://github.com/hoonkwan/classpick
- **자동배포**: `git push origin main` → Vercel 30초~1분 내 반영

## 사이트 정체성

| 항목 | 내용 |
|---|---|
| 운영 주체 | 교육인학원 |
| 운영 지역 | 부산 센텀점 · 사직점 |
| 대상 | 중·고등 학부모 및 학생 |
| 핵심 가치 | 시간표 한 장에 한 학기 라인업을 담는 것 |
| 광고/외부 입점 | 없음 (자사 안내 페이지) |

## 강사 라인업 (8인)

| 강사 | 과목 | 캠퍼스 |
|---|---|---|
| 윤훈관 | 영어 | 센텀 |
| 정준호 | 영어 | 사직 |
| 권정은 | 영어 | 센텀 |
| 김형석 | 수학 | 센텀 |
| 차동우 | 수학 | 센텀 |
| 이영환 | 수학 | 센텀 |
| 강필   | 수학 | 센텀 |
| 김규생 | 사회 | 센텀 |

## 사이트 구조

| 뷰 | 핵심 |
|---|---|
| 주간 시간표 (메인) | 요일×시간대 그리드 + Pre H 강조 + 다시 보기 |
| 강사진 | 8인 카드 + 강사별 전체 일정 (캘린더 + 학기 탭) |
| 학년·과목 | 학교+학년 / 학년+과목 / 강좌유형 3축 토글 |
| 학원 소개 | 센텀·사직 캠퍼스 비교 + 12개월 타임라인 |
| 월별 | 1~12월 pill |
| 검색 | 10축 필터 |

## 데이터 운영

| 소스 | 위치 |
|---|---|
| 마스터 시간표 (Google Sheet 동기화) | `db/courses.json` |
| 하드코드 시드 (오프라인 fallback) | `index.html` 내 `EDUIN_COURSES` |
| DB 시드 (Supabase 이식 준비) | `db/seed.sql` |

시트 → JSON 동기화: `npm run sync` 또는 GitHub Actions 정기 실행.

## 정정·문의

- 메일: `class-pick@naver.com`
- 처리 기한: 영업일 1일 이내
- 응대 범위: 시간표·강사·요일·시간 표시 오류·누락·변경

수강 상담 / 입반 문의는 각 캠퍼스 대표번호로 직접 부탁드립니다.

## 백엔드 인프라 (Phase 2 준비)

`api/` 아래 Vercel Serverless 함수 + Supabase 어댑터가 준비되어 있으며,
환경변수가 비어 있을 때는 mock 폴백으로 동작합니다.
키 등록 절차는 `SETUP.md` 참조.

- `api/health` · `api/config`
- `api/sms/*` (알리고 SMS 인증)
- `api/business/verify` (공공데이터포털 사업자번호)
- `api/payment/*` (토스 결제 — 학원 admin용 내부 결제 흐름)
- `api/upload/sign` (Supabase Storage 강사 사진 업로드)

스키마는 `db/schema.sql` 한 번 실행으로 9개 테이블 + RLS 정책 + 트리거 모두 적용.

## 로컬 개발

```bash
# 정적 사이트 (정적 호스팅)
# index.html 더블클릭 또는 VSCode Live Server

# 시트 동기화
npm install
npm run sync
```

## 라이선스 / 저작권

© 2026 교육인학원. All rights reserved.
