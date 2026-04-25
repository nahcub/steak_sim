// 1D unsteady heat diffusion via explicit FDM
// nodes[0] = bottom (pan contact), nodes[N-1] = top (air exposed)

function stepFDM(nodes, alpha, thickness, panTemp) {
  const dx = thickness / N_NODES;
  const r  = alpha * DT / (dx * dx); // Fourier number — must stay ≤ 0.5 for stability

  const next = [...nodes];

  // Interior nodes
  for (let i = 1; i < N_NODES - 1; i++) {
    next[i] = nodes[i] + r * (nodes[i + 1] - 2 * nodes[i] + nodes[i - 1]);
    // 고기 내부는 수분을 듬뿍 머금고 있으므로, 수분이 다 날아가지 않는 이상 100도를 넘을 수 없음
    if (next[i] > 100) next[i] = 100;
  }

  // Bottom boundary: Dirichlet (pan contact)
  next[0] = panTemp;

  // Top boundary: Robin BC (natural convection to air)
  // -k * dT/dx|top = h * (T_top - T_air)
  const flux = (H_CONV * DT) / (BEEF_RHO * BEEF_CP * dx);
  next[N_NODES - 1] =
    nodes[N_NODES - 1] +
    r * (nodes[N_NODES - 2] - nodes[N_NODES - 1]) -
    flux * (nodes[N_NODES - 1] - T_AIR);

  return next;
}

// Dynamic pan temperature: energy balance each timestep
// Pan loses heat to steak, gains heat from burner
function updatePanTemp(panTemp, nodes, thickness, panProps, burnerPower) {
  const dx = thickness / N_NODES;
  // Heat flux from pan into steak bottom node (W/m²)
  const heatFlux = BEEF_K * (panTemp - nodes[0]) / dx;
  // Energy extracted from pan by steak (J) = flux × area × dt
  const dE = heatFlux * STEAK_AREA * DT;
  
  // Burner efficiency (assume gas stove ~40% efficient)
  const BURNER_EFFICIENCY = 0.4;
  const dBurner = burnerPower * BURNER_EFFICIENCY * DT;

  // Pan loses heat to ambient air (natural convection & radiation approx)
  const PAN_AREA_EXPOSED = 0.05; // m²
  const dAirLoss = H_CONV * PAN_AREA_EXPOSED * (panTemp - T_AIR) * DT;

  // 시뮬레이션의 체감을 위해 프라이팬의 유효 열용량을 1/5로 줄여서 온도 변화가 더 눈에 띄게 만듭니다.
  const EFFECTIVE_MASS_FACTOR = 0.2;
  const thermalMass = panProps.mass * panProps.specificHeat * EFFECTIVE_MASS_FACTOR;

  return panTemp + (dBurner - dE - dAirLoss) / thermalMass;
}

// Flip steak: reverse temperature distribution
// After flip, old top (air side) becomes new bottom (pan side)
function flipSteak(nodes) {
  return [...nodes].reverse();
}

// REST mode: both sides exposed to air — carry-over cooking occurs naturally
// Returns updated nodes after one FDM step with both boundaries as Robin BC
function stepRest(nodes, thickness, alpha) {
  const dx  = thickness / N_NODES;
  const r   = alpha * DT / (dx * dx);
  const next = [...nodes];

  for (let i = 1; i < N_NODES - 1; i++) {
    next[i] = nodes[i] + r * (nodes[i + 1] - 2 * nodes[i] + nodes[i - 1]);
    // 내부 끓는점 100도 제한
    if (next[i] > 100) next[i] = 100;
  }

  // Both boundaries: Robin BC to air
  // 현실의 레스팅 시에는 표면 수분 증발과 복사열 방출로 인해 단순 대류(H_CONV)보다 훨씬 많은 열을 뺏깁니다.
  // 이를 반영하여 공기로 빠져나가는 열손실 계수를 8배로 증가시킵니다.
  const EFFECTIVE_H_REST = H_CONV * 8; 
  const flux = (EFFECTIVE_H_REST * DT) / (BEEF_RHO * BEEF_CP * dx);
  next[0]           = nodes[0]           - flux * (nodes[0]           - T_AIR) + r * (nodes[1]           - nodes[0]);
  next[N_NODES - 1] = nodes[N_NODES - 1] - flux * (nodes[N_NODES - 1] - T_AIR) + r * (nodes[N_NODES - 2] - nodes[N_NODES - 1]);

  return next;
}

// Get core (center node) temperature
function getCoreTemp(nodes) {
  return nodes[Math.floor(N_NODES / 2)];
}
