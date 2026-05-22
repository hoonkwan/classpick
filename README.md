# 클래스픽 (ClassPick)

> 동네 명강만 골라 담는 곳 — 서울(대치·목동·중계) / 부산(센텀·사직)

학원이 직접 강좌(opt-in)를 등록하고, 학부모가 여러 학원 강좌를 골라 **시간 겹침**을 자동으로 확인할 수 있는 정보 서비스입니다.

## 현재 단계 (Phase 1 — 정적 프로토타입)

- `index.html` 단일 파일 정적 사이트
- 데이터는 브라우저 `localStorage`에 저장 (사용자 기기별 분리)
- Vercel 정적 호스팅으로 배포

## 로컬에서 보기

```
# 그냥 index.html을 더블클릭하거나
# 간단한 로컬 서버
npx serve .
```

## 배포

- GitHub 리포: <https://github.com/hoonkwan/classpick>
- Vercel: vercel.com에서 이 리포 import → Deploy (정적 사이트라 빌드 설정 불필요)

## 다음 단계 (Phase 2 — Next.js + DB)

- Next.js로 이식, Vercel Postgres / Supabase 연결
- 학원 입점 신청 → 승인 흐름
- 도메인 연결 (`classpick.kr` 등)
- 광고 (AdSense / 학원 입점 프리미엄 슬롯)

## 법적 고지

- 강사 개인정보(연락처·사진)는 수집하지 않습니다.
- 강좌 등록·수정·삭제 권한은 해당 학원에 있습니다.
- 시간표는 변경될 수 있으니 수강 전 해당 학원에 직접 확인하세요.

## 라이선스

Private. © 2026 hoonkwan.
