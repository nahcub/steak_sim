// Main app — state management, game loop, event listeners

// ── State ─────────────────────────────────────────────────
let nodes        = [];
let panTemp      = PAN_INITIAL_TEMP;
let crustFront   = 0;   // 0–1, surface facing pan
let crustBack    = 0;   // 0–1, surface facing air (after flips)
let denaturation = [];
let alpha        = PROPERTIES.strip.alpha;
let panProps     = PAN_PROPERTIES.castiron;
let burnerPower  = 400; // W

let isRunning  = false;
let isResting  = false;
let isRevealed = false;
let flipCount  = 0;
let simSecs    = 0;      // total simulated seconds
let accumulator = 0;     // leftover real time not yet consumed by FDM steps (seconds)
let lastTimestamp = null; // rAF timestamp of previous frame
let rafId      = null;

let thickness  = 0.04;  // m (default 4 cm)

// ── Init ──────────────────────────────────────────────────
function initSim() {
  thickness    = parseFloat(document.getElementById('thickness-input').value) / 100;
  const initT  = parseFloat(document.getElementById('initial-temp-select').value);
  alpha        = PROPERTIES[document.getElementById('cut-select').value].alpha;
  panProps     = PAN_PROPERTIES[document.getElementById('pan-select').value];

  nodes         = Array(N_NODES).fill(initT);
  panTemp       = PAN_INITIAL_TEMP;
  crustFront    = 0;
  crustBack     = 0;
  denaturation  = initDenaturation();
  flipCount     = 0;
  simSecs       = 0;
  accumulator   = 0;
  lastTimestamp = null;
  isResting     = false;
  isRevealed    = false;

  document.getElementById('cut-display').textContent =
    PROPERTIES[document.getElementById('cut-select').value].label;

  renderFrame();
}

// ── Game loop (real-time locked) ──────────────────────────
// Uses fixed-timestep accumulator: sim advances exactly as much
// real time has passed, keeping simSecs === elapsed wall-clock seconds.
function loop(timestamp) {
  if (!isRunning) return;

  if (lastTimestamp !== null) {
    const frameMs = timestamp - lastTimestamp;
    // Cap at 200 ms to avoid spiral-of-death after tab was hidden
    accumulator += Math.min(frameMs, 200) / 1000;

    while (accumulator >= DT) {
      if (isResting) {
        nodes = stepRest(nodes, thickness, alpha);
      } else {
        panTemp = updatePanTemp(panTemp, nodes, thickness, panProps, burnerPower);
        nodes   = stepFDM(nodes, alpha, thickness, panTemp);
      }
      crustFront   = updateMaillard(crustFront, nodes[0]);
      crustBack    = updateMaillard(crustBack,  nodes[N_NODES - 1]);
      denaturation = updateDenaturation(denaturation, nodes);
      simSecs     += DT;
      accumulator -= DT;
    }
  }

  lastTimestamp = timestamp;
  renderFrame();
  updateTimer(simSecs);
  rafId = requestAnimationFrame(loop);
}

function renderFrame() {
  const coreTemp = getCoreTemp(nodes);
  const doneness = getDoneness(coreTemp);

  drawHeatmap(nodes, denaturation);
  drawPan(nodes, denaturation, crustFront, crustBack, isRevealed);
  updateStats({ coreTemp, crustFront, crustBack, doneness, panTemp, flipCount, simSecs });
}

// ── Controls ──────────────────────────────────────────────
function startStop() {
  if (!isRunning) {
    if (simSecs === 0) initSim();
    isRunning     = true;
    lastTimestamp = null; // reset so first frame doesn't count gap while paused
    document.getElementById('start-btn').textContent = '⏸ PAUSE';
    setActionBtns(true);
    rafId = requestAnimationFrame(loop);
  } else {
    isRunning = false;
    cancelAnimationFrame(rafId);
    document.getElementById('start-btn').textContent = '▶ RESUME';
  }
}

function doFlip() {
  const result = flipSteak(nodes, panTemp);
  nodes   = result.nodes;
  panTemp = result.panTemp;
  // Swap crust tracking: the face that was on the pan is now on top
  [crustFront, crustBack] = [crustBack, crustFront];
  flipCount++;
  isResting = false;
  document.getElementById('rest-btn').textContent = '☁ 레스팅';
  showToast('↩ 뒤집기 — ' + flipCount + '번째');
  renderFrame();
}

function doRest() {
  isResting = !isResting;
  document.getElementById('rest-btn').textContent =
    isResting ? '🔥 재가열' : '☁ 레스팅';
  showToast(isResting ? '☁ 레스팅 시작 — carry-over cooking 발생' : '🔥 다시 가열');
}

function doReveal() {
  isRevealed = !isRevealed;
  document.getElementById('reveal-btn').textContent =
    isRevealed ? '🥩 단면 숨기기' : '✂ 단면 공개';
  renderFrame();
}

function setActionBtns(enabled) {
  document.getElementById('flip-btn').disabled   = !enabled;
  document.getElementById('rest-btn').disabled   = !enabled;
  document.getElementById('reveal-btn').disabled = !enabled;
}

// ── Fire buttons ──────────────────────────────────────────
document.querySelectorAll('.fire-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fire-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    burnerPower = parseFloat(btn.dataset.power);
    showToast('불 세기: ' + btn.dataset.label + ' (' + burnerPower + 'W)');
  });
});

// ── API Key drawer ────────────────────────────────────────
document.getElementById('settings-toggle').addEventListener('click', () => {
  document.getElementById('api-drawer').classList.toggle('open');
});

document.getElementById('api-key-save').addEventListener('click', () => {
  const key = document.getElementById('api-key-input').value.trim();
  if (key) {
    setGeminiApiKey(key);
    document.getElementById('api-status').textContent = '✓ 저장됨';
    document.getElementById('api-drawer').classList.remove('open');
    showToast('Gemini API 키 저장 완료');
  }
});

// ── Gemini image upload ───────────────────────────────────
document.getElementById('upload-btn').addEventListener('click', () => {
  if (!getGeminiApiKey()) {
    showToast('먼저 API KEY를 입력하세요');
    document.getElementById('api-drawer').classList.add('open');
    return;
  }
  document.getElementById('steak-image').click();
});

document.getElementById('steak-image').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('gemini-status');
  statusEl.textContent = '분석 중…';

  try {
    const b64 = await fileToBase64(file);
    const result = await analyzeSteak(b64);
    if (result) {
      document.getElementById('cut-select').value = result.cut;
      document.getElementById('cut-display').textContent = PROPERTIES[result.cut].label;
      alpha = PROPERTIES[result.cut].alpha * (1 - result.fat_percent * 0.003);
      statusEl.textContent = '';
      showToast(
        `Gemini: ${PROPERTIES[result.cut].label} · 지방 ${result.fat_percent}%`
      );
    } else {
      statusEl.textContent = '분석 실패 — 수동 입력';
      showToast('분석 실패 — 슬라이더로 직접 입력하세요');
    }
  } catch (err) {
    statusEl.textContent = err.message;
    showToast('오류: ' + err.message);
  }

  // Reset file input for re-upload
  e.target.value = '';
});

// ── Main button listeners ─────────────────────────────────
document.getElementById('start-btn').addEventListener('click', startStop);
document.getElementById('flip-btn').addEventListener('click',  doFlip);
document.getElementById('rest-btn').addEventListener('click',  doRest);
document.getElementById('reveal-btn').addEventListener('click', doReveal);

// ── Reset on settings change ──────────────────────────────
['cut-select', 'pan-select', 'thickness-input', 'initial-temp-select'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    if (!isRunning && simSecs === 0) return;
    if (isRunning) {
      isRunning = false;
      cancelAnimationFrame(rafId);
      document.getElementById('start-btn').textContent = '▶ START';
      setActionBtns(false);
    }
    simSecs = 0;
    initSim();
    showToast('설정 변경 — 시뮬레이션 초기화');
  });
});

// ── Canvas resize observer ────────────────────────────────
const ro = new ResizeObserver(() => { if (nodes.length) renderFrame(); });
ro.observe(document.getElementById('pan-canvas'));
ro.observe(document.getElementById('heatmap-canvas'));

// ── Boot ──────────────────────────────────────────────────
initSim();

// Restore API key if previously saved in gemini.js default
if (getGeminiApiKey()) {
  document.getElementById('api-key-input').value = getGeminiApiKey();
  document.getElementById('api-status').textContent = '✓ 로드됨';
}
