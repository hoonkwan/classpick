/* 클래스픽 학원 마스터 — 강좌(data/courses.js)는 ac(학원 id)로 이 목록을 참조한다.
 * 새 학원 입점 시 여기에 한 줄 추가. logo 가 없으면 화면에 학원명 텍스트 배지로 나온다 (모든 학원 같은 규격).
 *   id      고유값 (강좌 ac 에서 참조)
 *   name    학원명
 *   branch  지점명 (없으면 "")
 *   area    동네 ("센텀" | "사직")
 *   logo    로고 경로 (학원이 공식 홈페이지에 공개한 로고만)
 *   site    공식 홈페이지
 */
window.CP_ACADEMIES = [
  { id: "eduin-centum", name: "교육인학원", branch: "센텀점", area: "센텀", logo: "assets/academies/eduin.webp", site: "https://kyin.co.kr" },
  { id: "eduin-sajik",  name: "교육인학원", branch: "사직점", area: "사직", logo: "assets/academies/eduin.webp", site: "https://kyin.co.kr" }
];
