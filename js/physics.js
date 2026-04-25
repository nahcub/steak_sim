// 1D unsteady heat diffusion via explicit FDM
// nodes[0] = bottom (pan contact), nodes[N-1] = top (air exposed)

function stepFDM(nodes, alpha, thickness, panTemp) {
  const dx = thickness / N_NODES;
  const r  = alpha * DT / (dx * dx); // Fourier number — must stay ≤ 0.5 for stability

  const next = [...nodes];

  // Interior nodes
  for (let i = 1; i < N_NODES - 1; i++) {
    next[i] = nodes[i] + r * (nodes[i + 1] - 2 * nodes[i] + nodes[i - 1]);
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
  // Heat flux from pan surface into steak bottom node (W/m²)
  const heatFlux = BEEF_K * (nodes[0] - panTemp) / dx;
  // Energy extracted from pan (J) = flux × area × dt
  const dE = heatFlux * STEAK_AREA * DT;
  // Burner adds energy to pan
  const dBurner = burnerPower * DT;
  return panTemp + (dBurner - dE) / (panProps.mass * panProps.specificHeat);
}

// Flip steak: reverse temperature distribution and swap boundary temperatures
// After flip, old top (air side) becomes new bottom (pan side)
function flipSteak(nodes, panTemp) {
  const flippedNodes = [...nodes].reverse();
  const newPanTemp   = nodes[N_NODES - 1]; // old top node temp becomes new pan contact
  return { nodes: flippedNodes, panTemp: newPanTemp };
}

// REST mode: both sides exposed to air — carry-over cooking occurs naturally
// Returns updated nodes after one FDM step with both boundaries as Robin BC
function stepRest(nodes, thickness, alpha) {
  const dx  = thickness / N_NODES;
  const r   = alpha * DT / (dx * dx);
  const next = [...nodes];

  for (let i = 1; i < N_NODES - 1; i++) {
    next[i] = nodes[i] + r * (nodes[i + 1] - 2 * nodes[i] + nodes[i - 1]);
  }

  // Both boundaries: Robin BC to air
  const flux = (H_CONV * DT) / (BEEF_RHO * BEEF_CP * dx);
  next[0]           = nodes[0]           - flux * (nodes[0]           - T_AIR) + r * (nodes[1]           - nodes[0]);
  next[N_NODES - 1] = nodes[N_NODES - 1] - flux * (nodes[N_NODES - 1] - T_AIR) + r * (nodes[N_NODES - 2] - nodes[N_NODES - 1]);

  return next;
}

// Get core (center node) temperature
function getCoreTemp(nodes) {
  return nodes[Math.floor(N_NODES / 2)];
}
