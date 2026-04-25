// UI rendering — canvas drawing + DOM stat updates

// ── Color mapping ────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

// Maps node temperature + denaturation to RGB array
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

// ── Heatmap canvas (cross-section) ───────────────────────
function drawHeatmap(nodes, denaturation) {
  const canvas = document.getElementById('heatmap-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 288;
  const H = 48;
  canvas.width = W;
  canvas.height = H;

  const stripeW = W / N_NODES;
  nodes.forEach((t, i) => {
    const [r, g, b] = tempToRGB(t, denaturation[i]);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(i * stripeW, 0, stripeW + 1, H);
  });
}

// ── Pan canvas (top-down view) ────────────────────────────
function drawPan(nodes, denaturation, crustFront, crustBack, revealed) {
  const canvas = document.getElementById('pan-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 500;
  const H = canvas.offsetHeight || 300;
  canvas.width = W;
  canvas.height = H;

  // Pan background (cast iron)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, H);

  // Grill lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 6;
  const gap = 28;
  for (let y = -W; y < W + H; y += gap) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y + W);
    ctx.stroke();
  }

  if (revealed) {
    _drawSteakRevealed(ctx, W, H, nodes, denaturation, crustFront, crustBack);
  } else {
    _drawSteakTopDown(ctx, W, H, nodes, denaturation, crustFront);
  }
}

function _drawSteakTopDown(ctx, W, H, nodes, denaturation, crustFront) {
  const cx = W / 2, cy = H / 2;
  const rx = W * 0.38, ry = H * 0.30;

  // Outer crust ring
  const [cr, cg, cb] = crustRGB(crustFront);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
  ctx.fill();

  // Inner meat (core temperature color)
  const coreIdx = Math.floor(N_NODES / 2);
  const [mr, mg, mb] = tempToRGB(nodes[coreIdx], denaturation[coreIdx]);
  const crustThickness = Math.min(0.45, crustFront * 0.5);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * (1 - crustThickness), ry * (1 - crustThickness), 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${mr},${mg},${mb})`;
  ctx.fill();

  // Subtle highlight
  const grad = ctx.createRadialGradient(cx - rx * 0.2, cy - ry * 0.2, 0, cx, cy, rx);
  grad.addColorStop(0, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * (1 - crustThickness), ry * (1 - crustThickness), 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}

function _drawSteakRevealed(ctx, W, H, nodes, denaturation, crustFront, crustBack) {
  // Show cross-section as vertical bands across the steak shape
  const cx = W / 2, cy = H / 2;
  const rx = W * 0.38, ry = H * 0.30;

  // Clip to steak ellipse
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();

  const bandW = (rx * 2) / N_NODES;
  const startX = cx - rx;
  nodes.forEach((t, i) => {
    const [r, g, b] = tempToRGB(t, denaturation[i]);
    // Apply crust to edge nodes
    let fr = r, fg = g, fb = b;
    if (i === 0) {
      const [cr, cg, cb] = crustRGB(crustFront);
      fr = Math.round(lerp(r, cr, crustFront));
      fg = Math.round(lerp(g, cg, crustFront));
      fb = Math.round(lerp(b, cb, crustFront));
    } else if (i === N_NODES - 1) {
      const [cr, cg, cb] = crustRGB(crustBack);
      fr = Math.round(lerp(r, cr, crustBack));
      fg = Math.round(lerp(g, cg, crustBack));
      fb = Math.round(lerp(b, cb, crustBack));
    }
    ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
    ctx.fillRect(startX + i * bandW, cy - ry, bandW + 1, ry * 2);
  });

  ctx.restore();

  // Outline
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Doneness labels
  const donenessInfo = getDoneness(nodes[Math.floor(N_NODES / 2)]);
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center';
  ctx.fillText(donenessInfo.label, cx, cy + 5);
}

// ── DOM stats ─────────────────────────────────────────────
function updateStats({ coreTemp, crustFront, crustBack, doneness, panTemp, flipCount, simSecs }) {
  document.getElementById('core-temp').textContent = coreTemp.toFixed(1) + '°C';
  document.getElementById('core-temp-header').textContent = coreTemp.toFixed(1) + '°C';
  document.getElementById('doneness-label').textContent = doneness.label;
  document.getElementById('doneness-header').textContent = doneness.label.toUpperCase();

  const cf = (crustFront * 100).toFixed(0) + '%';
  const cb = (crustBack * 100).toFixed(0) + '%';
  document.getElementById('crust-front-bar').style.width = cf;
  document.getElementById('crust-back-bar').style.width = cb;
  document.getElementById('crust-front-val').textContent = cf;
  document.getElementById('crust-back-val').textContent = cb;

  document.getElementById('pan-temp-display').textContent = panTemp.toFixed(0) + '°C';
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
