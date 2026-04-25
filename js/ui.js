// UI rendering — canvas drawing + DOM stat updates

// ── Pan/Tray images ─────────────────────────────────────────
const _panImg = new Image();
_panImg.onload = () => { if (typeof renderFrame === 'function') renderFrame(); };
_panImg.src = 'design/justpan.png';

const _trayImg = new Image();
_trayImg.onload = () => { if (typeof renderFrame === 'function') renderFrame(); };
_trayImg.src = 'design/tray.png';

// Steak bounding box as fraction of flyingpan.png dimensions
const _S = { l: 0.245, t: 0.36, r: 0.622, b: 0.598 };

// ── Color mapping ────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

// Scientific heatmap colormap (blue → cyan → green → yellow → red)
// Used for the cross-section heatmap canvas only
function tempToHeatmapRGB(t) {
  const n = Math.max(0, Math.min(1, (t - 4) / (150 - 4)));
  let r, g, b;
  if (n < 0.25) {
    const f = n / 0.25;
    r = 0; g = Math.round(lerp(0, 255, f)); b = 255;
  } else if (n < 0.5) {
    const f = (n - 0.25) / 0.25;
    r = 0; g = 255; b = Math.round(lerp(255, 0, f));
  } else if (n < 0.75) {
    const f = (n - 0.5) / 0.25;
    r = Math.round(lerp(0, 255, f)); g = 255; b = 0;
  } else {
    const f = (n - 0.75) / 0.25;
    r = 255; g = Math.round(lerp(255, 0, f)); b = 0;
  }
  return [r, g, b];
}

// Maps node temperature + denaturation to RGB array (used for pan view)
function tempToRGB(t, denat) {
  // Protein denaturation overrides raw color from ~52°C
  // Below 49°C: deep red (raw)
  if (t < 49) {
    const f = t / 49;
    return [lerp(80, 190, f), lerp(10, 30, f), lerp(20, 40, f)];
  }
  // 49–57°C: rare pink-red
  if (t < 57) {
    const f = (t - 49) / 8;
    return [lerp(190, 210, f), lerp(30, 60, f), lerp(40, 60, f)];
  }
  // 57–63°C: medium rare pink
  if (t < 63) {
    const f = (t - 57) / 6;
    return [lerp(210, 200, f), lerp(60, 90, f), lerp(60, 70, f)];
  }
  // 63–70°C: medium light brown
  if (t < 70) {
    const f = (t - 63) / 7;
    return [lerp(200, 170, f), lerp(90, 65, f), lerp(70, 40, f)];
  }
  // 70–80°C: medium well brown
  if (t < 80) {
    const f = (t - 70) / 10;
    return [lerp(170, 130, f), lerp(65, 40, f), lerp(40, 20, f)];
  }
  // >80°C: well done dark brown
  return [100, 30, 10];
}

// Maillard crust color — overlays on surface when crustLevel > 0
function crustRGB(crustLevel) {
  const f = Math.min(1, crustLevel);
  return [lerp(130, 55, f), lerp(60, 25, f), lerp(20, 8, f)];
}

// ── Heatmap canvas (vertical cross-section) ──────────────
// Top = air side (nodes[N-1]), Bottom = pan side (nodes[0])
function drawHeatmap(nodes, denaturation) {
  const canvas = document.getElementById('heatmap-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 288;
  const H = canvas.offsetHeight || 180;
  canvas.width = W;
  canvas.height = H;

  const stripeH = H / N_NODES;
  for (let i = 0; i < N_NODES; i++) {
    // i=0 → top of canvas → nodes[N-1] (air side)
    const nodeIdx = N_NODES - 1 - i;
    const [r, g, b] = tempToHeatmapRGB(nodes[nodeIdx]);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, i * stripeH, W, stripeH + 1);
  }

  // Draw colorbar
  const cb = document.getElementById('colorbar-canvas');
  if (cb) {
    const cbCtx = cb.getContext('2d');
    const cbH = cb.height;
    for (let y = 0; y < cbH; y++) {
      // y=0 → hot (150°C), y=cbH → cold (4°C)
      const t = lerp(150, 4, y / cbH);
      const [r, g, b] = tempToHeatmapRGB(t);
      cbCtx.fillStyle = `rgb(${r},${g},${b})`;
      cbCtx.fillRect(0, y, cb.width, 1);
    }
  }
}

// ── Pan canvas ────────────────────────────────────────────
function drawPan(nodes, denaturation, crustFront, crustBack, flipProgress = 1, isResting = false, maxCoreTemp = 22) {
  const canvas = document.getElementById('pan-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 500;
  const H = canvas.offsetHeight || 300;
  canvas.width = W;
  canvas.height = H;

  // White background (matches pan image)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  // ト레이일 때와 프라이팬일 때 위치를 각각 다르게 설정할 수 있습니다.
  // 예: 팬은 아래로 60픽셀, 트레이는 30픽셀 (숫자를 줄이면 위로 올라갑니다)
  const offsetY = isResting ? 60 : 60;
  ctx.translate(W / 2, H / 2 + offsetY);
  ctx.scale(0.5, 0.5);
  ctx.translate(-W / 2, -H / 2);

  // Pan bounce calculation
  let panBounceY = 0;
  if (flipProgress < 1) {
    if (flipProgress < 0.2) {
      // Jump off bounce
      panBounceY = Math.sin((flipProgress / 0.2) * Math.PI) * 4;
    } else if (flipProgress > 0.8) {
      // Landing bounce
      panBounceY = Math.sin(((flipProgress - 0.8) / 0.2) * Math.PI) * 6;
    }
  }

  // Draw pan or tray image
  const bgImg = isResting ? _trayImg : _panImg;
  if (bgImg.complete && bgImg.naturalWidth > 0) {
    ctx.drawImage(bgImg, 0, panBounceY, W, H);
  }

  // Steak rect in canvas coords
  const sx = W * _S.l;
  const sy = H * _S.t;
  const sw = W * (_S.r - _S.l);
  const sh = H * (_S.b - _S.t);

  // Steak animation offset & rotation
  let steakYOffset = panBounceY; // Follows pan when resting, separates when jumping
  let steakRotation = 0;

  if (flipProgress < 1) {
    // Parabola: up and down
    steakYOffset += -350 * Math.sin(flipProgress * Math.PI);
    // Rotation: starts at 180deg and ends at 0
    steakRotation = (1 - flipProgress) * Math.PI;
  }

  ctx.save();
  // Translate to center of steak
  const cx = sx + sw / 2;
  const cy = sy + sh / 2;

  ctx.translate(cx, cy + steakYOffset);
  ctx.rotate(steakRotation);
  ctx.translate(-cx, -cy);

  _drawSteakSideView(ctx, sx, sy, sw, sh, nodes, denaturation, crustFront, crustBack, maxCoreTemp);

  ctx.restore();

  ctx.restore(); // Restore global scale
}

function _drawSteakSideView(ctx, sx, sy, sw, sh, nodes, denaturation, crustFront, crustBack, maxCoreTemp) {
  const coreIdx = Math.floor(N_NODES / 2);
  const [mr, mg, mb] = tempToRGB(maxCoreTemp, denaturation[coreIdx]);
  const [cfr, cfg, cfb] = crustRGB(crustFront);
  const [cbr, cbg, cbb] = crustRGB(crustBack);

  // Vertical gradient: bottom = pan-face, top = air-face
  const grad = ctx.createLinearGradient(sx, sy + sh, sx, sy);
  const panR = Math.round(lerp(mr, cfr, crustFront));
  const panG = Math.round(lerp(mg, cfg, crustFront));
  const panB = Math.round(lerp(mb, cfb, crustFront));
  const airR = Math.round(lerp(mr, cbr, crustBack));
  const airG = Math.round(lerp(mg, cbg, crustBack));
  const airB = Math.round(lerp(mb, cbb, crustBack));
  grad.addColorStop(0, `rgb(${panR},${panG},${panB})`);
  grad.addColorStop(0.3, `rgb(${mr},${mg},${mb})`);
  grad.addColorStop(0.7, `rgb(${mr},${mg},${mb})`);
  grad.addColorStop(1, `rgb(${airR},${airG},${airB})`);

  ctx.fillStyle = grad;
  ctx.fillRect(sx, sy, sw, sh);

  // Subtle top-face highlight
  const hi = ctx.createLinearGradient(sx, sy, sx, sy + sh * 0.2);
  hi.addColorStop(0, 'rgba(255,255,255,0.10)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.fillRect(sx, sy, sw, sh * 0.2);
}

// ── Temperature Graph ─────────────────────────────────────
function drawGraph(history) {
  if (history.length === 0) return;
  const maxT = Math.max(10, history[history.length - 1].t);

  // Helper to draw a single line graph
  function renderSingleGraph(canvasId, valueKey, color, fixedMaxTemp) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 300;
    const H = canvas.offsetHeight || 120;
    canvas.width = W;
    canvas.height = H;

    ctx.clearRect(0, 0, W, H);

    function mapX(t) { return (t / maxT) * W; }
    function mapY(temp) { return (H - 15) - (temp / fixedMaxTemp) * (H - 15); }

    // Grid lines & Y-axis labels
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    
    ctx.beginPath();
    for (let y = 0; y <= fixedMaxTemp; y += 50) {
      const yPos = mapY(y);
      ctx.moveTo(0, yPos);
      ctx.lineTo(W, yPos);
      
      if (y > 0) {
        ctx.fillText(y + '°C', 2, yPos - 2);
      }
    }
    ctx.stroke();

    // X-axis Time Labels
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = '10px monospace';
    ctx.textBaseline = 'bottom';
    const numLabels = 4;
    for (let i = 0; i <= numLabels; i++) {
      const tVal = (maxT / numLabels) * i;
      let xPos = mapX(tVal);
      if (i === 0) { ctx.textAlign = 'left'; xPos = 2; }
      else if (i === numLabels) { ctx.textAlign = 'right'; xPos = W - 2; }
      else { ctx.textAlign = 'center'; }
      
      const m = Math.floor(tVal / 60);
      const s = Math.floor(tVal % 60);
      const timeStr = m + ':' + String(s).padStart(2, '0');
      ctx.fillText(timeStr, xPos, H - 2);
    }

    // Data Line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    history.forEach((pt, i) => {
      const x = mapX(pt.t);
      const y = mapY(pt[valueKey]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // Pan graph (max 300°C)
  renderSingleGraph('pan-graph-canvas', 'pan', '#E74C3C', 300);
  
  // Core graph (max 120°C for better resolution since it rarely exceeds 100°C)
  renderSingleGraph('core-graph-canvas', 'core', '#3498DB', 120);
}

// ── DOM stats ─────────────────────────────────────────────
function updateStats({ coreTemp, crustFront, crustBack, doneness, panTemp, flipCount, simSecs, waterLoss }) {
  document.getElementById('core-temp').textContent = coreTemp.toFixed(1) + '°C';
  document.getElementById('core-temp-header').textContent = coreTemp.toFixed(1) + '°C';
  document.getElementById('doneness-label').textContent = doneness.label;
  document.getElementById('doneness-label').style.color = doneness.color;
  document.getElementById('doneness-header').textContent = doneness.label.toUpperCase();

  const fPct = Math.round(crustFront * 100);
  const bPct = Math.round(crustBack * 100);
  document.getElementById('crust-front-bar').style.width = fPct + '%';
  document.getElementById('crust-front-val').textContent = fPct + '%';
  document.getElementById('crust-back-bar').style.width = bPct + '%';
  document.getElementById('crust-back-val').textContent = bPct + '%';

  const wPct = Math.min(100, waterLoss);
  document.getElementById('water-fill').style.width = wPct.toFixed(1) + '%';
  document.getElementById('water-val').textContent = wPct.toFixed(1) + '%';

  document.getElementById('pan-temp-display').textContent = Math.round(panTemp) + '°C';
  document.getElementById('flip-count').textContent = flipCount + '회';
  document.getElementById('sim-time').textContent = simSecs.toFixed(0) + 's';
}

function updateTimer(realSeconds) {
  const m = Math.floor(realSeconds / 60);
  const s = Math.floor(realSeconds % 60);
  document.getElementById('timer-display').textContent =
    String(m).padStart(1, '0') + ':' + String(s).padStart(2, '0');
}

// ── Toast ─────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}
