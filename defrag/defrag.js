const canvas = document.getElementById("defrag");
const ctx = canvas.getContext("2d");
const progressBar = document.getElementById("progress-bar");

/* ===== 設定 ===== */
const cols = 80;
const rows = 60;
const block = 8;
// 連続して移動するセクタ数の上限
const MAX_MOVE = 12;

/* ===== 状態 ===== */
const EMPTY = 0; // 空き（白）
const USED = 1; // 未処理（薄青）
const DONE = 2; // 処理済み（濃青）
const MOVING = 3; // 移動中（赤）

let grid = [];
let scanIndex = 0;
let activeMove = null;
let running = true; // 全体の実行フラグ
let paused = false; // 一時停止フラグ
let intervalId = null;

/* ===== 初期化（ファイルの塊を意図的に作る） ===== */
function init() {
  const total = rows * cols;
  grid = Array.from({ length: rows }, () => Array(cols).fill(EMPTY));

  // ベース：USED 多め
  for (let i = 0; i < total; i++) {
    setAt(i, Math.random() > 0.86 ? USED : EMPTY);
  }

  // 連続ファイル（実機っぽさ）
  for (let k = 0; k < 40; k++) {
    const start = Math.floor(Math.random() * total);
    const len =
      Math.random() < 0.15 ? 150 + Math.floor(Math.random() * 200) :
        Math.random() < 0.40 ? 30 + Math.floor(Math.random() * 120) :
          6 + Math.floor(Math.random() * 40);

    for (let i = 0; i < len && start + i < total; i++) {
      setAt(start + i, USED);
    }
  }

  scanIndex = 0;
  activeMove = null;
  progressBar.style.width = "0%";
}

/* ===== ユーティリティ ===== */
function pos(i) {
  return { x: i % cols, y: Math.floor(i / cols) };
}

function getAt(i) {
  const p = pos(i);
  return grid[p.y][p.x];
}

function setAt(i, v) {
  const p = pos(i);
  grid[p.y][p.x] = v;
}

/* ===== 描画 ===== */
function draw() {
  // 背景は白一色にして、空き(EMPTY)セルは描画しない
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = grid[y][x];
      if (v === EMPTY) continue;

      // 塗り色と枠線色をステータスごとに決定
      let fillColor = "#000000";
      let strokeColor = "#444444";
      if (v === USED) {
        fillColor = "#66cccc";
        strokeColor = "#2b8c8c";
      } else if (v === DONE) {
        fillColor = "#003399";
        strokeColor = "#001a66";
      } else if (v === MOVING) {
        fillColor = "#ff5555";
        strokeColor = "#aa0000";
      }

      const px = x * block;
      const py = y * block;
      const w = block - 1;
      const h = block - 1;

      ctx.fillStyle = fillColor;
      ctx.fillRect(px, py, w, h);

      ctx.lineWidth = 1;
      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    }
  }
}

/* ===== scanIndex より前を DONE に ===== */
function markDone() {
  for (let i = 0; i < scanIndex; i++) {
    if (getAt(i) === USED) setAt(i, DONE);
  }
}

/* ===== EMPTY 連続長 ===== */
function countEmpty(from) {
  const total = rows * cols;
  let len = 0;
  while (from + len < total && getAt(from + len) === EMPTY) len++;
  return len;
}

/* ===== USED 連続塊探索 ===== */
function findUsedRun(start, maxLen) {
  const total = rows * cols;
  const cap = Math.min(maxLen, MAX_MOVE);
  // 検索範囲も MAX_MOVE に制限（断片が多い場所でも短距離で走査）
  const searchLimit = Math.min(total, start + MAX_MOVE);
  for (let i = start; i < searchLimit; i++) {
    if (getAt(i) === USED) {
      let len = 0;
      while (i + len < total && getAt(i + len) === USED && len < cap) {
        len++;
      }
      if (len > 0) return { from: i, len };
    }
  }
  return null;
}

/* ===== メイン処理 ===== */
function step() {
  const total = rows * cols;
  if (scanIndex >= total) {
    progressBar.style.width = "100%";
    finished = true;
    showCompleteDialog();
    return;
    return;
  }

  markDone();

  /* 移動中 */
  if (activeMove) {
    activeMove.timer--;
    if (activeMove.timer <= 0) {
      const { from, to, len } = activeMove;
      for (let i = 0; i < len; i++) {
        setAt(from + i, EMPTY);
        setAt(to + i, DONE);
      }
      scanIndex += len;
      activeMove = null;
    }
    updateProgress();
    return;
  }

  /* 次の EMPTY へ */
  while (scanIndex < total && getAt(scanIndex) !== EMPTY) {
    scanIndex++;
  }
  if (scanIndex >= total) return;

  const emptyLen = countEmpty(scanIndex);
  if (emptyLen < 2) {
    scanIndex++;
    updateProgress();
    return;
  }

  const run = findUsedRun(scanIndex + emptyLen, emptyLen);
  if (!run) {
    scanIndex += Math.max(1, Math.floor(emptyLen / 2));
    updateProgress();
    return;
  }

  /* 移動演出（白い横棒） */
  for (let i = 0; i < run.len; i++) {
    setAt(run.from + i, MOVING);
    setAt(scanIndex + i, MOVING);
  }

  activeMove = {
    from: run.from,
    to: scanIndex,
    len: run.len,
    timer: 6
  };

  updateProgress();
}

/* ===== 進捗 ===== */
function updateProgress() {
  const total = rows * cols;
  const pct = Math.floor((scanIndex / total) * 100);
  progressBar.style.width = pct + "%";
}

/* ===== 完了ダイアログ ===== */
function showCompleteDialog() {
  const dialog = document.createElement("div");
  dialog.style.position = "absolute";
  dialog.style.left = "50%";
  dialog.style.top = "50%";
  dialog.style.transform = "translate(-50%, -50%)";
  dialog.style.width = "360px";
  dialog.style.background = "#c0c0c0";
  dialog.style.border = "2px solid #808080";
  dialog.style.boxShadow = "inset 1px 1px 0 #fff";
  dialog.style.fontFamily = "sans-serif";
  dialog.style.zIndex = 999;

dialog.innerHTML = `
  <div style="background:#000080;color:#fff;padding:6px 10px;font-weight:bold;">
    ディスク デフラグ
  </div>
  <div style="display:flex;gap:12px;padding:16px;">
    <div style="font-size:32px;">❔</div>
    <div>
      ドライブ C のデフラグが完了しました。<br>
      再デフラグしますか？
    </div>
  </div>
  <div style="display:flex;justify-content:center;gap:16px;padding-bottom:14px;">
    <button id="dlg-yes">はい</button>
    <button id="dlg-no">いいえ</button>
  </div>
`;

  document.body.appendChild(dialog);

  dialog.querySelector("#dlg-yes").onclick = () => {
    dialog.remove();
  };
  dialog.querySelector("#dlg-no").onclick = () => {
    dialog.remove();
  };
}

/* ===== 起動 ===== */
init();
draw();

// メインループ: 停止/一時停止フラグを考慮
intervalId = setInterval(() => {
  if (!running) return;
  if (paused) return;
  step();
  draw();
}, 30);

// ボタン制御
function setupControls() {
  const btnStop = document.getElementById("btn-stop");
  const btnPause = document.getElementById("btn-pause");
  const btnDetails = document.getElementById("btn-details");

  if (btnStop) {
    btnStop.addEventListener("click", () => {
      running = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      // 無効化して二度押しを防ぐ
      btnStop.disabled = true;
      if (btnPause) btnPause.disabled = true;
    });
  }

  if (btnPause) {
    btnPause.addEventListener("click", () => {
      paused = !paused;
      btnPause.textContent = paused ? "再開" : "一時停止";
    });
  }

  if (btnDetails) {
    btnDetails.addEventListener("click", () => {
      window.open("https://www.mimoex.net/", "_blank");
    });
  }
}

// ページ読み込み時にコントロールをセット
setupControls();
