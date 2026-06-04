# 선행기구개발그룹 · 모델별 시료 수량 기준 의견 취합 대시보드

제품군의 **모델별 시료 수 기준(현재 20대)**이 적정한지, 그룹 내 각 파트의 의견을
**제품군별 수량 + 사유**로 입력받아 **실시간으로 취합**하는 웹 대시보드입니다.

- **파트(행, 7개):** NE파트 · 패키지파트 · 선행CMF1파트 · 선행CMF2파트 · 선행CMF3파트 · HINGE개발LAB · 접합기술파트
- **제품군(열, 8개):** 전략HHP · 혁신HHP · 태블릿 · NPC · WATCH · TWS · XR · GLASS
- **기준값:** 20대 (기준 대비 적음/같음/많음을 색상으로 표시)

각 파트가 자기 행의 셀을 클릭해 수량과 사유를 입력하면, 표 · 요약 카드 · 차트가
**모든 참여자 화면에 실시간으로 반영**됩니다.

---

## 빠른 미리보기 (설정 없이)

Firebase 설정 전에도 **로컬 데모 모드**로 바로 사용해볼 수 있습니다
(입력 내용은 그 브라우저에만 저장되고, 다른 사람과 실시간 공유는 안 됩니다).

```bash
# 저장소 루트에서
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

상단에 노란색 "로컬 데모 모드" 배너가 보이면 정상입니다.

---

## 실시간 공유 설정 (Firebase) — 약 5분

여러 사람이 동시에 입력하고 결과를 실시간으로 공유하려면 무료 Firebase
프로젝트 하나만 연결하면 됩니다.

### 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com 접속 → **프로젝트 추가**
2. 프로젝트 이름 입력(예: `siryo-quantity`) → 생성 (Google 애널리틱스는 꺼도 됨)

### 2. Realtime Database 만들기
1. 왼쪽 메뉴 **빌드 → Realtime Database** → **데이터베이스 만들기**
2. 위치 선택(예: `asia-southeast1`) → **테스트 모드로 시작** 선택 후 사용 설정
   - 사내 의견취합용으로 간단히 시작하는 설정입니다. 보안 규칙은 아래 4단계에서 조정할 수 있습니다.

### 3. 웹 앱 설정값 복사
1. 좌측 상단 ⚙️ **프로젝트 설정 → 일반** 탭 아래로 스크롤
2. **내 앱**에서 웹 아이콘 `</>` 클릭 → 앱 등록(닉네임 입력, 호스팅 체크 불필요)
3. 표시되는 `firebaseConfig` 값을 복사해 **`js/config.js`**의 `FIREBASE_CONFIG`에 붙여넣기

```js
// js/config.js
export const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "siryo-quantity.firebaseapp.com",
  databaseURL: "https://siryo-quantity-default-rtdb.firebaseio.com",
  projectId: "siryo-quantity",
  storageBucket: "siryo-quantity.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234...:web:abcd...",
};
```

> 💡 위 웹 설정값(apiKey 등)은 **비밀 키가 아니라** 브라우저에 공개되는 식별값입니다.
> 공개 저장소에 두어도 보안상 문제가 없으며, 실제 접근 제어는 아래 Database 보안 규칙으로 합니다.

### 4. (권장) 보안 규칙
테스트 모드는 30일 뒤 만료됩니다. 사내에서 계속 쓰려면 Realtime Database
**규칙** 탭에서 아래처럼 단순 공개 read/write로 두거나(누구나 읽기/쓰기),
필요 시 인증 기반으로 더 제한할 수 있습니다.

```json
{
  "rules": {
    "submissions": {
      ".read": true,
      ".write": true
    }
  }
}
```

설정값을 채우고 새로고침하면 상단 배너가 초록색 **"실시간 연결됨"**으로 바뀝니다.

---

## GitHub Pages로 배포하기

1. 변경사항을 커밋/푸시
2. GitHub 저장소 **Settings → Pages**
3. **Source: Deploy from a branch** → Branch: `claude/sample-quantity-dashboard-HoLll`(또는 `main`) / 폴더 `/ (root)` → Save
4. 잠시 후 생성되는 공개 URL을 그룹원에게 공유

> `.nojekyll` 파일이 포함되어 있어 GitHub Pages가 파일을 그대로 서빙합니다.

---

## 사용 방법

1. 상단 **내 파트** 드롭다운에서 본인 파트를 선택 (작성자 이름은 선택 입력)
2. 본인 파트 **행**의 셀을 클릭 → 제안 수량과 사유 입력 후 저장
   - 다른 파트 행은 실수 방지를 위해 읽기 전용입니다.
3. 표 색상: 회색=미입력, 초록=기준(20대)과 동일, 파랑=기준보다 적음, 주황=기준보다 많음
4. 요약 카드와 차트로 제품군별 평균·동의율을 한눈에 확인
5. **CSV 내보내기**로 엑셀에서 열어 정리 가능(한글 깨짐 방지 처리됨)

---

## 항목 변경 방법

파트·제품군·기준값은 모두 **`js/config.js`** 한 곳에서 수정합니다.

```js
export const BASELINE = 20;                 // 기준 수량 변경
export const PARTS = [ ... ];               // 파트 추가/삭제
export const PRODUCT_GROUPS = [ ... ];      // 제품군 추가/삭제
```

`key`는 영문 식별자(중복 불가), `label`은 화면에 보이는 한글 이름입니다.

---

## 파일 구조

```
index.html        대시보드 페이지
css/styles.css    스타일 (반응형, 모바일 카드형 표)
js/config.js      파트/제품군/기준값/Firebase 설정
js/app.js         렌더링 · 실시간 동기화 · 입력 · CSV 로직
.nojekyll         GitHub Pages 정적 서빙
```

별도 빌드 과정이 없는 정적 사이트라 어떤 정적 호스팅에도 그대로 올릴 수 있습니다.
