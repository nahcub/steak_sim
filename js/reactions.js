// Reaction kinetics for steak cooking
// Both reactions modeled with Arrhenius equation: dX/dt = A * exp(-Ea / RT)

// Maillard reaction (surface browning/crust formation)
// Activates only above 140°C — requires dry surface conditions
const A_M  = 1e8;    // pre-exponential factor (empirical)
const Ea_M = 70000;  // activation energy, J/mol (~70 kJ/mol)

// Protein denaturation (doneness, color change inside)
// Very high Ea means sharp transition — mimics the steep sigmoidal curve from Food Lab data
const A_P  = 1e37;    // pre-exponential factor
const Ea_P = 250000;  // activation energy, J/mol (~250 kJ/mol)

const R_GAS = 8.314; // universal gas constant, J/mol·K

const MAILLARD_THRESHOLD = 140; // °C — no browning below this

// Update crust level (0–1) for one surface node
function updateMaillard(crustLevel, surfaceTemp) {
  if (surfaceTemp <= MAILLARD_THRESHOLD) return crustLevel;
  const T_K = 273.15 + surfaceTemp;
  const k   = A_M * Math.exp(-Ea_M / (R_GAS * T_K));
  return Math.min(1.0, crustLevel + k * DT);
}

// Update denaturation array (0–1 per node) for one timestep
function updateDenaturation(denaturation, nodes) {
  return denaturation.map((d, i) => {
    const T_K = 273.15 + nodes[i];
    const k   = A_P * Math.exp(-Ea_P / (R_GAS * T_K));
    return Math.min(1.0, d + k * DT);
  });
}

// Determine doneness label from core temperature
function getDoneness(coreTemp) {
  return (
    DONENESS.find(d => coreTemp <= d.maxTemp) ||
    DONENESS[DONENESS.length - 1]
  );
}

// Initialize denaturation state array
function initDenaturation() {
  return Array(N_NODES).fill(0);
}
