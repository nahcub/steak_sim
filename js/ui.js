// UI rendering — canvas drawing + DOM stat updates

// ── Pan image ────────────────────────────────────────────
const _panImg = new Image();
_panImg.onload = () => { if (typeof renderFrame === 'function') renderFrame(); };
_panImg.src = 'design/flyingpan.png';

// Steak bounding box as fraction of flyingpan.png dimensions
const _S = { l: 0.245, t: 0.36, r: 0.622, b: 0.598 };

// ── Color mapping ────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

// Scientific heatmap colormap (blue → cyan → green → yellow → red)
// Used for the cross-section heatmap canvas only
function tempToHeatmapRGB(t) {
  const n = Math.max(0, Math.min(1, (t - 4) / (240 - 4)));
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
      // y=0 → hot (240°C), y=cbH → cold (4°C)
      const t = lerp(240, 4, y / cbH);
      const [r, g, b] = tempToHeatmapRGB(t);
      cbCtx.fillStyle = `rgb(${r},${g},${b})`;
      cbCtx.fillRect(0, y, cb.width, 1);
    }
  }
}

// ── Pan canvas ────────────────────────────────────────────
function drawPan(nodes, denaturation, crustFront, crustBack, revealed) {
  const canvas = document.getElementById('pan-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 500;
  const H = canvas.offsetHeight || 300;
  canvas.width = W;
  canvas.height = H;

  // White background (matches pan image)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Draw pan image (stretched to canvas — steak fractions stay aligned)
  if (_panImg.complete && _panImg.naturalWidth > 0) {
    ctx.drawImage(_panImg, 0, 0, W, H);
  }

  // Steak rect in canvas coords
  const sx = W * _S.l;
  const sy = H * _S.t;
  const sw = W * (_S.r - _S.l);
  const sh = H * (_S.b - _S.t);

  if (revealed) {
    _drawSteakRevealed(ctx, sx, sy, sw, sh, nodes, denaturation, crustFront, crustBack);
  } else {
    _drawSteakSideView(ctx, sx, sy, sw, sh, nodes, denaturation, crustFront, crustBack);
  }
}

function _drawSteakSideView(ctx, sx, sy, sw, sh, nodes, denaturation, crustFront, crustBack) {
  const coreIdx = Math.floor(N_NODES / 2);
  const [mr, mg, mb] = tempToRGB(nodes[coreIdx], denaturation[coreIdx]);
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
  grad.addColorStop(0,   `rgb(${panR},${panG},${panB})`);
  grad.addColorStop(0.3, `rgb(${mr},${mg},${mb})`);
  grad.addColorStop(0.7, `rgb(${mr},${mg},${mb})`);
  grad.addColorStop(1,   `rgb(${airR},${airG},${airB})`);

  ctx.fillStyle = grad;
  ctx.fillRect(sx, sy, sw, sh);

  // Subtle top-face highlight
  const hi = ctx.createLinearGradient(sx, sy, sx, sy + sh * 0.2);
  hi.addColorStop(0, 'rgba(255,255,255,0.10)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.fillRect(sx, sy, sw, sh * 0.2);
}

function _drawSteakRevealed(ctx, sx, sy, sw, sh, nodes, denaturation, crustFront, crustBack) {
  // Cross-section: vertical bands from pan-side (left) to air-side (right)
  const bandW = sw / N_NODES;
  nodes.forEach((t, i) => {
    const [r, g, b] = tempToRGB(t, denaturation[i]);
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
    ctx.fillRect(sx + i * bandW, sy, bandW + 1, sh);
  });

  // Doneness label
  const donenessInfo = getDoneness(nodes[Math.floor(N_NODES / 2)]);
  ctx.font = `600 ${Math.max(11, Math.round(sh * 0.28))}px Inter, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'center';
  ctx.fillText(donenessInfo.label, sx + sw / 2, sy + sh / 2 + 5);
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
