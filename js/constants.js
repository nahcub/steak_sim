// Beef thermal properties
const BEEF_K = 0.5;       // W/m·K
const BEEF_RHO = 1050;    // kg/m³
const BEEF_CP = 3500;     // J/kg·K
const STEAK_AREA = 0.02;  // m²

// Simulation parameters
const N_NODES = 20;
const DT = 0.5;           // s — well within FDM stability limit (dx²/2α ≈ 14.8s for 4cm steak)
const SIM_SPEED = 1;      // sim steps per animation frame — 0.5 sim-sec/frame @ 60fps ≈ 27 real-sec per side

// Cut thermal diffusivity (α = k / ρCp, adjusted for fat content)
const PROPERTIES = {
  tenderloin: { alpha: 1.35e-7, label: '안심' },
  strip:      { alpha: 1.25e-7, label: '등심' },
  ribeye:     { alpha: 1.10e-7, label: '립아이' },
};

// Pan thermal mass (affects how much pan cools when cold steak is placed)
const PAN_PROPERTIES = {
  castiron:  { specificHeat: 460, mass: 2.5, label: '무쇠팬' },
  stainless: { specificHeat: 500, mass: 1.2, label: '스테인레스' },
  nonstick:  { specificHeat: 900, mass: 0.6, label: '코팅팬' },
};

// Doneness thresholds by core temperature (°C)
const DONENESS = [
  { maxTemp: 52,  label: 'Raw',         color: '#8B0000' },
  { maxTemp: 57,  label: 'Rare',        color: '#C0392B' },
  { maxTemp: 63,  label: 'Medium Rare', color: '#E74C3C' },
  { maxTemp: 68,  label: 'Medium',      color: '#D35400' },
  { maxTemp: 74,  label: 'Medium Well', color: '#A04000' },
  { maxTemp: 999, label: 'Well Done',   color: '#784212' },
];

// Convection coefficient for top surface exposed to air (natural convection)
const H_CONV = 15;    // W/m²·K
const T_AIR  = 22;    // °C

// Initial pan temperature when simulation starts
const PAN_INITIAL_TEMP = 200; // °C
