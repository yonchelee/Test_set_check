// ============================================================================
// 선행기구개발그룹 시료 수량 의견취합 대시보드 - 메인 로직
// ----------------------------------------------------------------------------
// - Firebase Realtime Database로 실시간 다중 사용자 동기화
// - Firebase 미설정 시 자동으로 localStorage 기반 "로컬 데모 모드"로 동작
// ============================================================================

import {
  BASELINE,
  PARTS,
  PRODUCT_GROUPS,
  FIREBASE_CONFIG,
  ADMIN_PASSWORD,
  isFirebaseConfigured,
} from "./config.js";

// ----------------------------------------------------------------------------
// 상태
// ----------------------------------------------------------------------------
const LS_DATA_KEY = "ssc_submissions_v1";   // 데모 모드 데이터 저장 키
const LS_PART_KEY = "ssc_my_part";           // 내 파트 기억
const LS_AUTHOR_KEY = "ssc_author";          // 작성자 기억

let mode = "demo";          // "live" | "demo"
let data = {};              // { partKey: { groupKey: { quantity, reason, author, pwHash, updatedAt } } }
let myPart = "";            // 현재 선택된 파트 key
let adminMode = false;      // 관리자 비밀번호 입력 시 true (전체 권한)
let chart = null;

// Firebase 핸들 (live 모드에서만 채워짐)
let fb = { db: null, ref: null, set: null, remove: null, serverTimestamp: null };

// 현재 편집 중인 셀
let editingCell = { part: null, group: null };

// DOM 캐시
const $ = (id) => document.getElementById(id);
const el = {
  modeBanner: $("modeBanner"),
  connStatus: $("connStatus"),
  partSelect: $("partSelect"),
  authorInput: $("authorInput"),
  passwordInput: $("passwordInput"),
  adminBadge: $("adminBadge"),
  exportBtn: $("exportBtn"),
  editHint: $("editHint"),
  summaryCards: $("summaryCards"),
  matrixHead: $("matrixHead"),
  matrixBody: $("matrixBody"),
  baselineLabel: $("baselineLabel"),
  chartBaseline: $("chartBaseline"),
  // 모달
  modalOverlay: $("modalOverlay"),
  modalCellInfo: $("modalCellInfo"),
  editForm: $("editForm"),
  qtyInput: $("qtyInput"),
  reasonInput: $("reasonInput"),
  cancelBtn: $("cancelBtn"),
  deleteBtn: $("deleteBtn"),
  modalLock: $("modalLock"),
  footerStatus: $("footerStatus"),
};

// ----------------------------------------------------------------------------
// 비밀번호 처리
// ----------------------------------------------------------------------------
// 비밀번호는 평문 저장하지 않고 SHA-256 해시로 저장/비교합니다.
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function currentPassword() {
  return el.passwordInput ? el.passwordInput.value : "";
}

// 현재 입력된 비밀번호로 해당 셀을 수정/삭제할 수 있는지 검사
async function canModify(cell) {
  if (adminMode) return true;                 // 관리자: 모든 권한
  if (!cell || !cell.pwHash) return true;     // 신규/미보호(레거시) 항목
  const pw = currentPassword();
  if (!pw) return false;
  return (await sha256(pw)) === cell.pwHash;
}

// ----------------------------------------------------------------------------
// 헬퍼
// ----------------------------------------------------------------------------
const partLabel = (k) => (PARTS.find((p) => p.key === k) || {}).label || k;
const groupLabel = (k) => (PRODUCT_GROUPS.find((g) => g.key === k) || {}).label || k;

function getCell(partKey, groupKey) {
  return (data[partKey] && data[partKey][groupKey]) || null;
}

// 기준 대비 셀 색상 클래스
function cellClass(qty) {
  if (qty == null || qty === "" || isNaN(qty)) return "sw-empty";
  if (qty === BASELINE) return "sw-equal";
  if (qty < BASELINE) return "sw-low";
  return "sw-high";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ----------------------------------------------------------------------------
// 초기화
// ----------------------------------------------------------------------------
async function init() {
  el.baselineLabel.textContent = `${BASELINE}대`;
  el.chartBaseline.textContent = BASELINE;

  buildPartSelect();
  buildMatrixHead();

  // 저장된 사용자 설정 복원
  myPart = localStorage.getItem(LS_PART_KEY) || "";
  el.partSelect.value = myPart;
  el.authorInput.value = localStorage.getItem(LS_AUTHOR_KEY) || "";

  wireEvents();

  if (isFirebaseConfigured()) {
    await startLiveMode();
  } else {
    startDemoMode();
  }

  render();
}

function buildPartSelect() {
  for (const p of PARTS) {
    const opt = document.createElement("option");
    opt.value = p.key;
    opt.textContent = p.label;
    el.partSelect.appendChild(opt);
  }
}

function buildMatrixHead() {
  const tr = document.createElement("tr");
  const corner = document.createElement("th");
  corner.className = "corner";
  corner.textContent = "파트 \\ 제품군";
  tr.appendChild(corner);
  for (const g of PRODUCT_GROUPS) {
    const th = document.createElement("th");
    th.textContent = g.label;
    tr.appendChild(th);
  }
  el.matrixHead.appendChild(tr);
}

// ----------------------------------------------------------------------------
// 모드 설정
// ----------------------------------------------------------------------------
async function startLiveMode() {
  mode = "live";
  try {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const dbMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    const db = dbMod.getDatabase(app);
    fb = {
      db,
      ref: dbMod.ref,
      set: dbMod.set,
      remove: dbMod.remove,
      serverTimestamp: dbMod.serverTimestamp,
      onValue: dbMod.onValue,
    };

    // 실시간 구독
    dbMod.onValue(dbMod.ref(db, "submissions"), (snap) => {
      data = snap.val() || {};
      render();
    });

    setBanner("live", "🟢 실시간 연결됨 · 입력 내용이 모든 사용자에게 즉시 공유됩니다.");
    setConn("live", "실시간 연결됨");
  } catch (err) {
    console.error("Firebase 초기화 실패, 데모 모드로 전환합니다.", err);
    startDemoMode("Firebase 연결에 실패하여 로컬 데모 모드로 전환되었습니다. 설정값을 확인해 주세요.");
  }
}

function startDemoMode(extraMsg) {
  mode = "demo";
  data = loadDemoData();
  const base = "⚪ 로컬 데모 모드 · 이 브라우저에만 저장됩니다. 실시간 공유를 원하면 README의 Firebase 설정을 완료하세요.";
  setBanner("demo", extraMsg ? `${extraMsg} ${base}` : base);
  setConn("demo", "로컬 데모 모드");
}

function setBanner(kind, msg) {
  el.modeBanner.textContent = msg;
  el.modeBanner.className = `mode-banner ${kind}`;
}
function setConn(kind, text) {
  el.connStatus.className = `conn-status ${kind}`;
  el.connStatus.querySelector(".conn-text").textContent = text;
}

// 데모 모드 영속화
function loadDemoData() {
  try { return JSON.parse(localStorage.getItem(LS_DATA_KEY)) || {}; }
  catch { return {}; }
}
function saveDemoData() {
  localStorage.setItem(LS_DATA_KEY, JSON.stringify(data));
}

// ----------------------------------------------------------------------------
// 저장 / 삭제 (모드 분기)
// ----------------------------------------------------------------------------
async function writeCell(partKey, groupKey, payload) {
  if (mode === "live") {
    await fb.set(fb.ref(fb.db, `submissions/${partKey}/${groupKey}`), {
      ...payload,
      updatedAt: fb.serverTimestamp(),
    });
  } else {
    if (!data[partKey]) data[partKey] = {};
    data[partKey][groupKey] = { ...payload, updatedAt: Date.now() };
    saveDemoData();
    render();
  }
}

async function deleteCell(partKey, groupKey) {
  if (mode === "live") {
    await fb.remove(fb.ref(fb.db, `submissions/${partKey}/${groupKey}`));
  } else {
    if (data[partKey]) delete data[partKey][groupKey];
    saveDemoData();
    render();
  }
}

// ----------------------------------------------------------------------------
// 렌더링
// ----------------------------------------------------------------------------
function render() {
  renderMatrix();
  renderSummary();
  renderChart();
}

function renderMatrix() {
  el.matrixBody.innerHTML = "";

  for (const p of PARTS) {
    const tr = document.createElement("tr");
    const editable = adminMode || p.key === myPart;   // 관리자는 모든 행 편집 가능
    if (editable) tr.classList.add("editable-row");

    const th = document.createElement("th");
    th.textContent = p.label;
    tr.appendChild(th);

    for (const g of PRODUCT_GROUPS) {
      const td = document.createElement("td");
      td.dataset.col = g.label; // 모바일 카드 라벨
      const cell = getCell(p.key, g.key);
      const qty = cell ? Number(cell.quantity) : null;

      const div = document.createElement("div");
      div.className = `cell ${cellClass(qty)} ${editable ? "editable" : "readonly"}`;

      if (cell && qty != null && !isNaN(qty)) {
        const reasonText = cell.reason ? `사유: ${cell.reason}` : "사유 미입력";
        const authorText = cell.author ? ` · 작성자: ${cell.author}` : "";
        const lockText = cell.pwHash ? " 🔒보호됨" : "";
        div.innerHTML =
          `<span class="qty">${qty}</span><span class="unit">대${cell.pwHash ? " 🔒" : ""}</span>` +
          (cell.reason ? `<span class="reason-mark">📝 ${escapeHtml(cell.reason)}</span>` : "");
        div.title = `${reasonText}${authorText}${lockText}`;
      } else {
        div.innerHTML = `<span class="qty">—</span>` +
          (editable ? `<span class="reason-mark">클릭하여 입력</span>` : "");
      }

      if (editable) {
        div.addEventListener("click", () => openModal(p.key, g.key));
      }
      td.appendChild(div);
      tr.appendChild(td);
    }
    el.matrixBody.appendChild(tr);
  }

  // 제품군별 평균 행
  const avgTr = document.createElement("tr");
  avgTr.className = "avg-row";
  const avgTh = document.createElement("th");
  avgTh.textContent = "제품군 평균";
  avgTr.appendChild(avgTh);
  for (const g of PRODUCT_GROUPS) {
    const td = document.createElement("td");
    td.dataset.col = g.label;
    const { avg, count } = groupStats(g.key);
    const div = document.createElement("div");
    div.className = `cell ${cellClass(avg == null ? null : Math.round(avg))}`;
    div.innerHTML = avg == null
      ? `<span class="qty">—</span>`
      : `<span class="qty">${avg.toFixed(1)}</span><span class="unit">대 (${count}/${PARTS.length})</span>`;
    avgTr.appendChild(td).appendChild(div);
  }
  el.matrixBody.appendChild(avgTr);
}

function groupStats(groupKey) {
  const vals = [];
  for (const p of PARTS) {
    const c = getCell(p.key, groupKey);
    if (c && c.quantity != null && !isNaN(Number(c.quantity))) vals.push(Number(c.quantity));
  }
  if (!vals.length) return { avg: null, count: 0, agree: 0 };
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const agree = vals.filter((v) => v === BASELINE).length;
  return { avg, count: vals.length, agree };
}

function renderSummary() {
  // 전체 통계
  let total = 0, sum = 0, agree = 0;
  const filledGroups = new Set();
  for (const p of PARTS) {
    for (const g of PRODUCT_GROUPS) {
      const c = getCell(p.key, g.key);
      if (c && c.quantity != null && !isNaN(Number(c.quantity))) {
        total++;
        sum += Number(c.quantity);
        if (Number(c.quantity) === BASELINE) agree++;
        filledGroups.add(g.key);
      }
    }
  }
  const totalCells = PARTS.length * PRODUCT_GROUPS.length;
  const overallAvg = total ? (sum / total).toFixed(1) : "—";
  const agreeRate = total ? Math.round((agree / total) * 100) : 0;
  const progress = Math.round((total / totalCells) * 100);

  const cards = [
    { label: "입력 진행률", value: `${progress}%`, sub: `${total} / ${totalCells} 셀 입력` },
    { label: "전체 평균 제안 수량", value: `${overallAvg}${total ? "대" : ""}`, sub: `기준 ${BASELINE}대` },
    { label: `기준(${BASELINE}대) 동의율`, value: `${agreeRate}%`, sub: `${agree} / ${total} 의견 일치` },
    { label: "의견 제출 파트", value: `${countActiveParts()} / ${PARTS.length}`, sub: "참여 파트 수" },
  ];

  el.summaryCards.innerHTML = cards.map((c) => `
    <div class="summary-card">
      <div class="label">${escapeHtml(c.label)}</div>
      <div class="value">${escapeHtml(c.value)}</div>
      <div class="sub">${escapeHtml(c.sub)}</div>
    </div>`).join("");
}

function countActiveParts() {
  let n = 0;
  for (const p of PARTS) {
    const row = data[p.key];
    if (row && Object.values(row).some((c) => c && c.quantity != null && !isNaN(Number(c.quantity)))) n++;
  }
  return n;
}

function renderChart() {
  const labels = PRODUCT_GROUPS.map((g) => g.label);
  const avgs = PRODUCT_GROUPS.map((g) => {
    const { avg } = groupStats(g.key);
    return avg == null ? 0 : Number(avg.toFixed(2));
  });
  const colors = avgs.map((v) => {
    if (v === 0) return "#c2c8d6";
    if (v === BASELINE) return "#2bb673";
    return v < BASELINE ? "#2f6df6" : "#e8843a";
  });

  const ctx = document.getElementById("avgChart");
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = avgs;
    chart.data.datasets[0].backgroundColor = colors;
    chart.options.plugins.annotationLine = BASELINE;
    chart.update();
    return;
  }

  // 기준선을 그리는 간단한 플러그인
  const baselinePlugin = {
    id: "baselineLine",
    afterDraw(c) {
      const yScale = c.scales.y;
      const y = yScale.getPixelForValue(BASELINE);
      const { left, right } = c.chartArea;
      const g = c.ctx;
      g.save();
      g.strokeStyle = "#d23b3b";
      g.lineWidth = 1.5;
      g.setLineDash([6, 4]);
      g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#d23b3b";
      g.font = "600 11px 'Noto Sans KR', sans-serif";
      g.fillText(`기준 ${BASELINE}대`, left + 6, y - 6);
      g.restore();
    },
  };

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "평균 제안 수량(대)",
        data: avgs,
        backgroundColor: colors,
        borderRadius: 6,
        maxBarThickness: 56,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const g = PRODUCT_GROUPS[item.dataIndex];
              const { count } = groupStats(g.key);
              return ` 평균 ${item.parsed.y}대 (${count}개 파트 입력)`;
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "수량(대)" } },
      },
    },
    plugins: [baselinePlugin],
  });
}

// ----------------------------------------------------------------------------
// 모달 (입력)
// ----------------------------------------------------------------------------
function openModal(partKey, groupKey) {
  editingCell = { part: partKey, group: groupKey };
  const existing = getCell(partKey, groupKey);
  el.modalCellInfo.textContent = `${partLabel(partKey)} · ${groupLabel(groupKey)}  (기준 ${BASELINE}대)`;
  el.qtyInput.value = existing && existing.quantity != null ? existing.quantity : BASELINE;
  el.reasonInput.value = existing && existing.reason ? existing.reason : "";
  el.deleteBtn.style.display = existing ? "" : "none";

  // 보호 상태 안내
  if (adminMode) {
    el.modalLock.className = "modal-lock open";
    el.modalLock.textContent = "🔑 관리자 모드 — 비밀번호 없이 수정·삭제할 수 있습니다.";
  } else if (existing && existing.pwHash) {
    el.modalLock.className = "modal-lock locked";
    el.modalLock.textContent = `🔒 보호된 항목${existing.author ? ` (작성자: ${existing.author})` : ""} — 수정·삭제하려면 상단에 작성자 비밀번호를 입력하세요.`;
  } else {
    el.modalLock.className = "modal-lock";
    el.modalLock.textContent = "🔐 저장 시 상단에 입력한 비밀번호로 이 항목이 보호됩니다.";
  }
  el.modalOverlay.classList.remove("hidden");
  el.qtyInput.focus();
  el.qtyInput.select();
}

function closeModal() {
  el.modalOverlay.classList.add("hidden");
  editingCell = { part: null, group: null };
}

function updateEditHint() {
  if (adminMode) {
    el.editHint.textContent = "🔑 관리자 모드: 모든 파트의 셀을 자유롭게 입력·수정·삭제할 수 있습니다.";
  } else if (myPart) {
    el.editHint.textContent = `선택한 파트: ${partLabel(myPart)} · 해당 행의 셀을 클릭해 입력하세요. (다른 파트 행은 읽기 전용)`;
  } else {
    el.editHint.textContent = "파트를 선택하면 해당 행의 셀을 클릭해 수량·사유를 입력할 수 있습니다.";
  }
}

// ----------------------------------------------------------------------------
// 이벤트 연결
// ----------------------------------------------------------------------------
function wireEvents() {
  el.partSelect.addEventListener("change", () => {
    myPart = el.partSelect.value;
    localStorage.setItem(LS_PART_KEY, myPart);
    updateEditHint();
    renderMatrix();
  });

  el.authorInput.addEventListener("input", () => {
    localStorage.setItem(LS_AUTHOR_KEY, el.authorInput.value.trim());
  });

  // 비밀번호 입력 → 관리자 모드 판별
  el.passwordInput.addEventListener("input", () => {
    const wasAdmin = adminMode;
    adminMode = el.passwordInput.value === ADMIN_PASSWORD;
    el.adminBadge.classList.toggle("hidden", !adminMode);
    if (adminMode !== wasAdmin) {
      updateEditHint();
      renderMatrix();
    }
  });

  el.cancelBtn.addEventListener("click", closeModal);
  el.modalOverlay.addEventListener("click", (e) => {
    if (e.target === el.modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.modalOverlay.classList.contains("hidden")) closeModal();
  });

  el.editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { part, group } = editingCell;
    if (!part || !group) return;
    const qty = parseInt(el.qtyInput.value, 10);
    if (isNaN(qty) || qty < 0) { alert("올바른 수량을 입력하세요."); return; }

    const existing = getCell(part, group);
    const pw = currentPassword();

    // 보호된 기존 항목은 비밀번호(또는 관리자) 확인
    if (!(await canModify(existing))) {
      alert("비밀번호가 일치하지 않습니다.\n이 항목을 수정하려면 작성자 비밀번호 또는 관리자 비밀번호를 입력하세요.");
      return;
    }

    // 저장할 보호 해시 결정
    let pwHash;
    if (existing && existing.pwHash) {
      pwHash = existing.pwHash;          // 기존 잠금 유지 (관리자가 수정해도 원 작성자 비밀번호 유지)
    } else if (adminMode) {
      pwHash = null;                     // 관리자가 만든 신규/미보호 항목
    } else {
      if (!pw) { alert("임의 삭제 방지를 위해 상단에 작성자 비밀번호를 입력한 뒤 저장하세요."); return; }
      pwHash = await sha256(pw);         // 신규 항목을 현재 비밀번호로 보호
    }

    const payload = {
      quantity: qty,
      reason: el.reasonInput.value.trim(),
      author: el.authorInput.value.trim() || "",
      pwHash: pwHash,
    };
    try {
      await writeCell(part, group, payload);
      closeModal();
      flashStatus("저장되었습니다.");
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다. 콘솔을 확인하세요.");
    }
  });

  el.deleteBtn.addEventListener("click", async () => {
    const { part, group } = editingCell;
    if (!part || !group) return;
    const existing = getCell(part, group);
    if (!(await canModify(existing))) {
      alert("비밀번호가 일치하지 않습니다.\n이 항목을 삭제하려면 작성자 비밀번호 또는 관리자 비밀번호를 입력하세요.");
      return;
    }
    if (!confirm("이 셀의 입력을 삭제할까요?")) return;
    try {
      await deleteCell(part, group);
      closeModal();
      flashStatus("삭제되었습니다.");
    } catch (err) {
      console.error(err);
      alert("삭제 중 오류가 발생했습니다.");
    }
  });

  el.exportBtn.addEventListener("click", exportCsv);

  // 초기 힌트 갱신
  updateEditHint();
}

function flashStatus(msg) {
  el.footerStatus.textContent = `${msg} (${new Date().toLocaleTimeString("ko-KR")})`;
}

// ----------------------------------------------------------------------------
// CSV 내보내기
// ----------------------------------------------------------------------------
function exportCsv() {
  const header = ["파트", ...PRODUCT_GROUPS.map((g) => g.label)];
  const rows = [header];

  for (const p of PARTS) {
    const row = [p.label];
    for (const g of PRODUCT_GROUPS) {
      const c = getCell(p.key, g.key);
      if (c && c.quantity != null) {
        const reason = (c.reason || "").replace(/\s+/g, " ").trim();
        row.push(reason ? `${c.quantity}대 (${reason})` : `${c.quantity}대`);
      } else {
        row.push("");
      }
    }
    rows.push(row);
  }

  // 평균 행
  const avgRow = ["제품군 평균"];
  for (const g of PRODUCT_GROUPS) {
    const { avg } = groupStats(g.key);
    avgRow.push(avg == null ? "" : `${avg.toFixed(1)}대`);
  }
  rows.push(avgRow);

  const csv = rows.map((r) =>
    r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  ).join("\r\n");

  // UTF-8 BOM 추가 (엑셀 한글 깨짐 방지)
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `시료수량_의견취합_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------------------
init();
