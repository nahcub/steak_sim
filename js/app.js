// Main app — state management, game loop, event listeners

// ── State ─────────────────────────────────────────────────
let nodes = [];
let panTemp = PAN_INITIAL_TEMP;
let crustFront = 0;   // 0–1, surface facing pan
let crustBack = 0;   // 0–1, surface facing air (after flips)
let waterLoss = 0;   // Moisture loss percentage
let denaturation = [];
let tempHistory = []; // {t: simSecs, pan: panTemp, core: coreTemp}
let alpha = PROPERTIES.strip.alpha;
let panProps = PAN_PROPERTIES.castiron;
let burnerPower = 400; // W

let isRunning = false;
let isResting = false;
let simSpeed = 3;
let flipCount = 0;
let simSecs = 0;      // total simulated seconds
let accumulator = 0;     // leftover real time not yet consumed by FDM steps (seconds)
let lastTimestamp = null; // rAF timestamp of previous frame
let rafId = null;
let flipAnimProgress = 1; // 1 = animation done
let maxCoreTemp = 22;

let thickness = 0.04;  // m (default 4 cm)

// ── Init ──────────────────────────────────────────────────
function initSim() {
  thickness = parseFloat(document.getElementById('thickness-input').value) / 100;
  const initT = parseFloat(document.getElementById('initial-temp-select').value);
  alpha = PROPERTIES[document.getElementById('cut-select').value].alpha;
  panProps = PAN_PROPERTIES[document.getElementById('pan-select').value];

  nodes = Array(N_NODES).fill(initT);
  panTemp = PAN_INITIAL_TEMP;
  crustFront = 0;
  crustBack = 0;
  waterLoss = 0;
  denaturation = initDenaturation();
  tempHistory = [];
  flipCount = 0;
  simSecs = 0;
  accumulator = 0;
  lastTimestamp = null;
  isResting = false;
  flipAnimProgress = 1;
  maxCoreTemp = initT;

  renderFrame();
}

// ── Game loop (real-time locked) ──────────────────────────
// Uses fixed-timestep accumulator: sim advances exactly as much
// real time has passed, keeping simSecs === elapsed wall-clock seconds.
function loop(timestamp) {
  if (lastTimestamp === null) lastTimestamp = timestamp;
  const frameMs = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  let needsRender = false;

  // Animation update
  if (flipAnimProgress < 1) {
    flipAnimProgress += frameMs / 600; // 600ms duration
    if (flipAnimProgress > 1) flipAnimProgress = 1;
    needsRender = true;
  }

  // Physics update
  if (isRunning) {
    // Cap at 200 ms to avoid spiral-of-death after tab was hidden
    accumulator += (Math.min(frameMs, 200) / 1000) * simSpeed;

    while (accumulator >= DT) {
      if (isResting) {
        nodes = stepRest(nodes, thickness, alpha);
      } else {
        panTemp = updatePanTemp(panTemp, nodes, thickness, panProps, burnerPower);
        nodes = stepFDM(nodes, alpha, thickness, panTemp);
        crustFront = updateMaillard(crustFront, nodes[0]);
      }

      // 수분 증발 모델: 표면이 100도가 넘으면 잠열을 소비하며 수분 손실
      // 표면이 건조해질수록(waterLoss 증가) 증발 속도가 줄어들어 마침내 100도를 돌파할 수 있게 함.
      const WATER_LATENT_HEAT = 2.26e6; // J/kg
      const BASE_EVAP_RATE = 0.05;      // kg/s/m² 
      const DRY_THRESHOLD = 5.0;        // 수분 손실 5% 도달 시 표면 건조로 간주
      const beefMass = STEAK_AREA * thickness * BEEF_RHO;
      const mass_surface = beefMass / N_NODES;

      if (!isResting && nodes[0] > 100) {
        // 표면이 마를수록 증발량 감소
        const currentEvapRate = BASE_EVAP_RATE * Math.max(0, 1 - (waterLoss / DRY_THRESHOLD));
        
        if (currentEvapRate > 0) {
          const evMass = currentEvapRate * STEAK_AREA * DT;
          const heatCon = evMass * WATER_LATENT_HEAT;
          nodes[0] -= heatCon / (mass_surface * BEEF_CP);
          if (nodes[0] < 100) nodes[0] = 100;
          waterLoss += (evMass / beefMass) * 100;
        }
      }

      denaturation = updateDenaturation(denaturation, nodes);
      simSecs += DT;
      tempHistory.push({ t: simSecs, pan: panTemp, core: getCoreTemp(nodes) });
      accumulator -= DT;
    }
    needsRender = true;
  }

  if (needsRender) {
    renderFrame();
    if (isRunning) updateTimer(simSecs);
  }

  rafId = requestAnimationFrame(loop);
}

function renderFrame() {
  const coreTemp = getCoreTemp(nodes);
  maxCoreTemp = Math.max(maxCoreTemp, coreTemp);
  const doneness = getDoneness(maxCoreTemp);

  drawHeatmap(nodes, denaturation);
  drawPan(nodes, denaturation, crustFront, crustBack, flipAnimProgress, isResting, maxCoreTemp);
  drawGraph(tempHistory);
  updateStats({ coreTemp, crustFront, crustBack, doneness, panTemp, flipCount, simSecs, waterLoss });
}

// ── Controls ──────────────────────────────────────────────
function startStop() {
  if (!isRunning) {
    if (simSecs === 0) initSim();
    isRunning = true;
    lastTimestamp = performance.now(); // reset so first frame doesn't count gap while paused
    document.getElementById('start-btn').textContent = '⏸ PAUSE';
    setActionBtns(true);
  } else {
    isRunning = false;
    document.getElementById('start-btn').textContent = '▶ RESUME';
  }
}

function doFlip() {
  nodes = flipSteak(nodes);
  // Swap crust tracking: the face that was on the pan is now on top
  [crustFront, crustBack] = [crustBack, crustFront];
  flipCount++;
  isResting = false;
  document.getElementById('rest-btn').textContent = '☁ 레스팅';
  showToast('↩ 뒤집기 — ' + flipCount + '번째');
  flipAnimProgress = 0; // Trigger animation
}

function doRest() {
  isResting = !isResting;
  document.getElementById('rest-btn').textContent =
    isResting ? '🔥 재가열' : '☁ 레스팅';
  showToast(isResting ? '☁ 레스팅 시작 — carry-over cooking 발생' : '🔥 다시 가열');
}

function toggleSpeed() {
  if (simSpeed === 1) simSpeed = 3;
  else if (simSpeed === 3) simSpeed = 10;
  else simSpeed = 1;
  document.getElementById('speed-btn').textContent = `속도: ${simSpeed}x`;
  showToast(`시뮬레이션 속도: ${simSpeed}배속`);
}

function setActionBtns(enabled) {
  document.getElementById('flip-btn').disabled = !enabled;
  document.getElementById('rest-btn').disabled = !enabled;
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

// ── Main button listeners ─────────────────────────────────
document.getElementById('start-btn').addEventListener('click', startStop);
document.getElementById('flip-btn').addEventListener('click', doFlip);
document.getElementById('rest-btn').addEventListener('click', doRest);
document.getElementById('speed-btn').addEventListener('click', toggleSpeed);

// ── Serve & Result Modal ──────────────────────────────────
document.getElementById('serve-btn').addEventListener('click', () => {
  if (isRunning) startStop(); // Pause simulation
  
  const m = Math.floor(simSecs / 60);
  const s = Math.floor(simSecs % 60);
  const timeStr = m > 0 ? `${m}분 ${s}초` : `${s}초`;
  
  const doneness = getDoneness(maxCoreTemp);
  const front = Math.round(crustFront * 100);
  const back = Math.round(crustBack * 100);
  const crustScore = (front + back) / 2;
  
  let crustText = "";
  if (crustScore > 80) crustText = "완벽한 시어링(Perfect Searing) 겉바속촉!";
  else if (crustScore > 50) crustText = "적당히 바삭한 크러스트";
  else crustText = "크러스트가 부족합니다 (조금 더 센 불에 구워보세요)";

  let waterText = waterLoss > 15 ? "육즙이 많이 빠져나갔습니다 (퍽퍽함 주의)" : "풍부한 육즙이 완벽히 보존되었습니다!";

  const summaryHTML = `
    <div style="font-size: 24px; font-weight: bold; color: ${doneness.color}; margin-bottom: 10px;">
      ${doneness.label.toUpperCase()} (${maxCoreTemp.toFixed(1)}°C)
    </div>
    <ul style="text-align: left; background: #f8f9fa; padding: 15px 20px 15px 40px; border-radius: 6px; margin-bottom: 24px;">
      <li style="margin-bottom: 8px;"><strong>총 조리 시간:</strong> ${timeStr}</li>
      <li style="margin-bottom: 8px;"><strong>뒤집기 횟수:</strong> ${flipCount}회</li>
      <li style="margin-bottom: 8px;"><strong>크러스트:</strong> ${crustText} (앞 ${front}%, 뒤 ${back}%)</li>
      <li style="margin-bottom: 8px;"><strong>수분 손실률:</strong> ${waterLoss.toFixed(1)}%</li>
      <li style="margin-bottom: 8px;"><strong>육즙 상태:</strong> ${waterText}</li>
    </ul>
  `;
  
  document.getElementById('result-summary').innerHTML = summaryHTML;
  document.getElementById('result-modal').classList.add('open');
});

document.getElementById('close-modal-btn').addEventListener('click', () => {
  document.getElementById('result-modal').classList.remove('open');
  initSim();
});

// ── Reset on settings change ──────────────────────────────
['cut-select', 'pan-select', 'thickness-input', 'initial-temp-select'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    if (!isRunning && simSecs === 0) return;
    if (isRunning) {
      isRunning = false;
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
ro.observe(document.getElementById('pan-graph-canvas'));
ro.observe(document.getElementById('core-graph-canvas'));

// ── Boot ──────────────────────────────────────────────────
initSim();
rafId = requestAnimationFrame(loop);

// Restore API key if previously saved in gemini.js default
if (getGeminiApiKey()) {
  document.getElementById('api-key-input').value = getGeminiApiKey();
  document.getElementById('api-status').textContent = '✓ 로드됨';
}
