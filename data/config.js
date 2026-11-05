/* 클래스픽 백엔드 설정 — 클래스픽 전용 Supabase 프로젝트 (kyin 프로젝트 사용 금지)
 * supabaseKey 에는 공개용 anon / publishable 키만 넣는다. service_role 키는 절대 넣지 않는다.
 * 둘 다 비어 있으면: 공개 화면은 정적 데이터만, 등록은 메일 신청으로 동작.
 * (localhost 에서는 등록→승인 흐름을 시험하는 모의 백엔드가 켜진다)
 */
window.CP_CONFIG = {
  supabaseUrl: "",
  supabaseKey: ""
};
