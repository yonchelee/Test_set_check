// ============================================================================
// 선행기구개발그룹 시료 수량 의견취합 대시보드 - 설정 파일
// ----------------------------------------------------------------------------
// 이 파일에서 파트/제품군 목록, 기준 수량, Firebase 설정을 관리합니다.
// 비전문가도 쉽게 수정할 수 있도록 모든 설정을 한 곳에 모았습니다.
// ============================================================================

// 모델별 시료 수 기준값 (대)
export const BASELINE = 20;

// 그룹 내 파트 목록 (표의 행)
// key: Firebase/내부 저장용 안전 키(영문), label: 화면 표시 이름(한글)
export const PARTS = [
  { key: "ne",        label: "NE파트" },
  { key: "package",   label: "패키지파트" },
  { key: "cmf1",      label: "선행CMF1파트" },
  { key: "cmf2",      label: "선행CMF2파트" },
  { key: "cmf3",      label: "선행CMF3파트" },
  { key: "hinge",     label: "HINGE개발LAB" },
  { key: "bonding",   label: "접합기술파트" },
];

// 제품군 목록 (표의 열)
export const PRODUCT_GROUPS = [
  { key: "strategic_hhp",  label: "전략HHP" },
  { key: "innovative_hhp", label: "혁신HHP" },
  { key: "tablet",         label: "태블릿" },
  { key: "npc",            label: "NPC" },
  { key: "watch",          label: "WATCH" },
  { key: "tws",            label: "TWS" },
  { key: "xr",             label: "XR" },
  { key: "glass",          label: "GLASS" },
];

// ============================================================================
// Firebase 설정
// ----------------------------------------------------------------------------
// 실시간 다중 사용자 공유를 사용하려면 아래 값을 본인의 Firebase 프로젝트
// 설정값으로 바꿔주세요. (README.md의 설정 가이드 참고)
//
// 아래 값이 플레이스홀더("YOUR_...")로 남아 있으면 앱이 자동으로
// "로컬 데모 모드"(브라우저 localStorage)로 동작합니다.
// ============================================================================
export const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Firebase 설정이 실제 값으로 채워졌는지 판별 (플레이스홀더면 데모 모드)
export function isFirebaseConfigured() {
  const c = FIREBASE_CONFIG;
  return (
    c.apiKey &&
    !c.apiKey.startsWith("YOUR_") &&
    c.databaseURL &&
    !c.databaseURL.includes("YOUR_PROJECT")
  );
}
