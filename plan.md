# 🥩 The Steak Scientist — Hackathon Plan


---

## 프로젝트 개요

### 한 줄 요약
스테이크 심부 온도를 **열전도 편미분 방정식**으로 계산하는, 가장 진지하게 쓸모없는 AI 앱

### 이그노벨 프레임
| 기준 | 내용 |
|------|------|
| 😂 웃음 | "스테이크 굽는 데 비정상 상태 열전도 방정식을 쓴다고?" |
| 💡 사고의 전환 | 근데 이게 실제로 맞는 방법임. Carry-over cooking, 뒤집기 횟수, 지방 단열 효과를 수치로 증명 |
| ⚙️ 기술적 치밀함 | Gemini Vision + 1D FDM 물리엔진 + 실시간 히트맵 + GitHub Pages 배포 |

### 식품과학적 근거
J. Kenji López-Alt, *The Food Lab* 실험 데이터를 물리 엔진 파라미터로 직접 사용

---

## 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| 프론트엔드 | 계층적 구조 (모듈화 + 번들링 선택) | HTML 진입점, JS 모듈 분리 가능 |
| 물리 엔진 | Vanilla JS (1D FDM) | Python 서버 불필요 |
| AI | Gemini 1.5 Flash Vision | Google AI 조건 충족 |
| 배포 | Vercel |

### 프로젝트 구조 (확장 가능한 레이아웃)

```
steak_simulator/
├── index.html           ← 진입점 (UI 레이아웃)
├── css/
│   ├── main.css        ← 전역 스타일
│   └── heatmap.css     ← 히트맵 + 애니메이션
├── js/
│   ├── app.js          ← 메인 앱 로직 (초기화, 이벤트 리스너)
│   ├── physics.js      ← FDM 엔진 (PDE 시뮬레이션)
│   ├── reactions.js    ← 마이야르 + 단백질 변성 모델
│   ├── evaporation.js  ← 수분 증발 모델
│   ├── gemini.js       ← Gemini Vision API 통신
│   ├── ui.js           ← 화면 갱신 (히트맵, 게이지, 토스트)
│   └── constants.js    ← 물성치, 설정값 룩업테이블
├── assets/
│   └── (향후 이미지, SVG 등)
└── README.md
```

**초기 배포 (Hackathon)**: 모든 JS 파일을 `<script>` 태그로 `index.html`에서 로드  
**확장 시 (Post-hackathon)**: Webpack/Vite로 번들링 → 프로덕션 최적화

**장점**:
- 개발 중: 파일 분리로 코드 가독성 ↑, 팀 협업 용이
- 배포: 초기엔 단순 추가 `<script>` 로드, 필요하면 번들러 도입
- 유지보수: 물리 엔진, UI, API 로직이 분리되어 테스트 + 수정 쉬움

---

## UI 레이아웃

```
┌────────────────────────────────────────────┐
│  🥩 THE STEAK SCIENTIST                    │
│  "열전도 방정식으로 스테이크를 굽습니다"       │
├─────────────────┬──────────────────────────┤
│                 │                          │
│  [📷 사진 업로드] │    canvas 히트맵          │
│  → Gemini 분석  │    (단면 온도 분포)        │
│                 │    파랑 → 분홍 → 갈색      │
│  부위: [등심 ▼]  │                          │
│  팬:  [무쇠팬 ▼] │  🌡️ 심부온도: 54°C        │
│  두께:  ━━●━━   │  🥩 익힘: Medium Rare ✓  │
│  초기온도: ●냉장  │                          │
│  불세기: ━━●━━  │  🟫 크러스트: ████░░ 60%  │
│                 │  💧 수분손실: 4%          │
│  [ 🔥 START ]   │                          │
│  [ 🔄 뒤집기  ]  │                          │
│  [ ⏸ REST    ]  │                          │
│  [ ✂️ CUT    ]  │                          │
└─────────────────┴──────────────────────────┘
```

---

## 물리 엔진 설계

### 열전달 모델 (Heat Transfer)

**3가지 열전달 모드** (복사 무시, 대류는 근사):

| 경로 | 메커니즘 | 모델 | 비고 |
|------|---------|------|------|
| 팬 → 스테이크 (하단) | 전도 (Conduction) | T_bottom = T_pan(t) 또는 q 지정 | 팬의 에너지 균형으로 T_pan(t) 동적 계산 |
| 공기 → 스테이크 (상단) | 자연대류 (Natural Convection) | -k(∂T/∂n) = h(T - T_air) | h ≈ 10~20 W/m²·K (자연대류 근사) |
| 내부 | 전도 (Conduction) | ∂T/∂t = α∇²T | FDM으로 이산화 |

**팬 접촉 경계조건 (Dirichlet BC)**:
$$T(x=0, t) = T_{pan}(t)$$

**공기 노출 경계조건 (Robin BC)**:
$$-k \frac{\partial T}{\partial x}\bigg|_{x=L} = h(T(x=L,t) - T_{air})$$

여기서:
- k = 열전도율 (W/m·K)
- h = 대류 열전달계수 (W/m²·K), 자연대류에서는 약 10~20
- T_air = 실온 22°C

---

### 내부 열전도 PDE (Heat Diffusion Equation)

**1차원 비정상 열전도 방정식 (Unsteady 1D Heat Diffusion)**:

$$\frac{\partial T}{\partial t} = \alpha \nabla^2 T = \alpha \frac{\partial^2 T}{\partial x^2}$$

여기서 **열확산율 (Thermal Diffusivity)**:

$$\alpha = \frac{k}{\rho \cdot C_p} \quad [\text{m}^2/\text{s}]$$

**스테이크 물성치** (*The Food Lab* 데이터 기반):

| 매개변수 | 값 | 단위 | 비고 |
|---------|-----|------|------|
| k (열전도율) | ~0.5 | W/m·K | 고기 조직 (수분 함유) |
| ρ (밀도) | ~1050 | kg/m³ | 가우 고기 |
| Cₚ (비열) | ~3500 | J/kg·K | 수분 함유량에 따라 변동 |
| α (열확산율) | ~1.35e-7 | m²/s | 부위별로 1.1~1.35e-7 범위 |

**뜻: 두께 L인 스테이크가 온도평형에 도달하는 특성시간 (Characteristic Time)**:

$$t_* \sim \frac{L^2}{\alpha}$$

예: L = 4 cm = 0.04 m → $t_* \sim \frac{(0.04)^2}{1.35 \times 10^{-7}} \approx 12000$ 초 ≈ **3.3시간**
(실제론 팬과 공기에서 열 들어오므로 훨씬 더 빠름)

---

### 1D 유한차분법 (FDM)

고기 두께 L을 N=20개 노드로 분할. 매 timestep마다 온도 업데이트:

```
T_i(t+1) = T_i(t) + α * Δt / Δx² * (T_{i+1} - 2*T_i + T_{i-1})
```

### 열확산율 (α) 룩업테이블

*The Food Lab* 마블링 데이터 기반:

```javascript
const PROPERTIES = {
  tenderloin: { alpha: 1.35e-7, desc: "안심 — 지방 적음, 열 빠르게 침투" },
  strip:      { alpha: 1.25e-7, desc: "등심 — 균형잡힌 마블링" },
  ribeye:     { alpha: 1.10e-7, desc: "립아이 — 지방 많음, 열 느리게 침투" },
};

// Gemini fat_percent로 보정
alpha = BASE_ALPHA * (1 - fat_percent * 0.003);
```

### 팬 물성치 룩업테이블

차가운 고기를 뜨거운 팬에 올리면 팬 온도가 순간적으로 떨어짐. 팬의 비열과 질량에 따라 낙폭이 달라지며, 이것이 무쇠팬이 코팅팬보다 스테이크를 잘 굽는 이유임.

```javascript
const PAN_PROPERTIES = {
  castiron: {
    name: "무쇠팬",
    specificHeat: 460,   // J/kg·K
    mass: 2.5,           // kg (두꺼운 팬)
    desc: "열용량 크다 → 고기 올려도 온도 안 떨어짐 → 강한 시어링"
  },
  stainless: {
    name: "스테인레스팬",
    specificHeat: 500,   // J/kg·K
    mass: 1.2,           // kg
    desc: "중간 열용량 → 적당한 온도 유지"
  },
  nonstick: {
    name: "얇은 코팅팬",
    specificHeat: 900,   // J/kg·K (알루미늄 기반)
    mass: 0.6,           // kg
    desc: "열용량 작다 → 고기 올리면 온도 확 떨어짐 → 약한 시어링"
  }
};
```

### 경계조건 (팬 온도 동적 계산)

고정 온도(Dirichlet) 대신 매 timestep마다 팬의 에너지 균형으로 panTemp를 업데이트:

```javascript
// 매 timestep: 고기가 팬에서 열을 빼앗는 만큼 팬 온도 하락
const heatFlux = BEEF_K * (nodes[0] - panTemp) / dx;  // W/m²
const { specificHeat, mass } = PAN_PROPERTIES[selectedPan];
panTemp -= (heatFlux * STEAK_AREA * dt) / (mass * specificHeat);

// 버너가 팬을 다시 가열 (불세기 슬라이더)
panTemp += burnerPower * dt / (mass * specificHeat);
```

| 위치 | 조건 | 값 |
|------|------|-----|
| 하단 (팬 접촉면) | 동적 (에너지 균형) | 초기 불세기 설정값, 매 step 업데이트 |
| 상단 (공기 노출면) | Dirichlet | 실온 22°C |
| REST 모드 | 양쪽 모두 | 실온 22°C, 버너 off |

### 뒤집기 로직

```javascript
function flipSteak() {
  nodes.reverse();                    // 온도 분포 반전
  [panTemp, ambientTemp] = [ambientTemp, panTemp];  // 경계조건 교체
  flipCount++;
  // 애니메이션 트리거
  steak.classList.add('flipping');
  setTimeout(() => steak.classList.remove('flipping'), 600);
}
```

> **The Food Lab 근거**: 30초마다 뒤집는 것이 한 번 뒤집는 것보다 더 균일하게 익음.
> 뒤집기 횟수가 많을수록 히트맵이 더 균일해지는 것을 시각적으로 보여줌.

### Carry-over Cooking (REST 버튼)

```javascript
function startRest() {
  panTemp = 22;       // 팬 온도 → 실온
  ambientTemp = 22;   // 양면 모두 냉각
  // 심부 온도가 잠깐 더 오르다가 내려오는 현상 발생
  // 목표온도 -5°C에서 "지금 드세요!" 알림
}
```

> **The Food Lab 근거**: 1.5인치 스테이크는 팬에서 꺼낸 후 심부가 약 5°C 더 상승.
> 탐침 온도계로는 이 타이밍을 예측할 수 없지만, 우리 앱은 예측함.

### 반응 모델 (Reaction Kinetics)

고기 가열 시 **두 가지 주요 변화**:

#### 1. 마이야르 반응 (Maillard Reaction) — 표면 갈변 (Browning)

**화학 반응**:
$$\frac{dM}{dt} = A \cdot \exp\left(-\frac{E_a}{RT}\right)$$

여기서:
- M = Maillard 반응 진행도 (0.0 ~ 1.0)
- A = 사전지수계수 (Pre-exponential factor)
- E_a = 활성화에너지 (Activation Energy), ≈ 60~80 kJ/mol
- R = 기체상수 = 8.314 J/mol·K
- T = 절대온도 (K)

**조건**: M > 0의 증가는 **T > 140°C (표면 온도)** 일 때만 활성화

**구현**:
```javascript
const MAILLARD_THRESHOLD = 140; // °C
const A = 1e8;     // 사전지수계수 (경험값)
const Ea = 70000;  // 활성화에너지 (J/mol)
const R = 8.314;   // 기체상수

if (nodes[0] > MAILLARD_THRESHOLD) {
  const k = A * Math.exp(-Ea / (R * (273.15 + nodes[0])));
  crustLevel = Math.min(1.0, crustLevel + k * dt);
  // 크러스트 게이지: ████░░ 
}
```

**색상 매핑**: M값 증가 → RGB(180→100, 60→20, 20→10) = 갈색 심화

#### 2. 단백질 변성 (Protein Denaturation) — 내부 색상 (Doneness)

**온도 기반 상태 변화** (불가역적):

| 심부 온도 | 상태 | 색상 | 특징 |
|-----------|------|------|------|
| < 52°C | **Raw (생)** | 빨강 (Rare) | 단백질 미변성, 육즙 최대 |
| 52–60°C | **Rare ~ Medium Rare** | 분홍 (Pink) | 부분 변성, 서서히 액체 손실 |
| 60–70°C | **Medium ~ Medium Well** | 연갈색 (Light Brown) | 대부분 변성, 조직 수축 |
| > 70°C | **Well Done (완전)** | 갈색 (Dark Brown) | 완전 변성, 건조함 |

**모델** (Arrhenius 기반 누적 변성도):

$$\frac{dD}{dt} = A_p \cdot \exp\left(-\frac{E_{p}}{RT}\right)$$

D = 단백질 변성도 (0.0 ~ 1.0)  
A_p ≈ 1e37, E_p ≈ 250 kJ/mol (*The Food Lab* 데이터)

**구현**: 매 timestep마다 각 노드의 단백질 변성도 누적 계산, 색상 결정

### 수분 증발 모델 (Moisture Evaporation)

**선택지 1: 완전 무시** (기본 초기 구현)
- 수분 손실을 계산하지 않음
- 물리 엔진 단순화, 프로토타입 빠르게 완성

**선택지 2: 간단한 모델** (현실감 + 구현 용이)

표면 온도가 **100°C에 도달할 때만** 수분 증발 모델 활성화:

$$\frac{dW}{dt} = -h_m \cdot (P_{sat}(T) - P_{air})$$

여기서:
- W = 스테이크 내 수분 함유량 (kg/kg 건조물)
- h_m = 물질전달계수 (m/s)
- P_sat(T) = 포화증기압 (T일 때, Pa)
- P_air = 공기 습도에 따른 부분압 (Pa)

**단순화 구현** (공기 상대습도 ~50%):

```javascript
const WATER_LATENT_HEAT = 2.26e6;  // J/kg, 100°C에서 수증기 잠열
const EVAPORATION_RATE = 0.05;      // kg/s/m² (경험값)

// 표면에서만 증발 (nodes[0] = 표면 온도)
if (nodes[0] >= 100) {
  // 1. 증발량 계산
  const evaporationMass = EVAPORATION_RATE * STEAK_AREA * dt;  // kg
  
  // 2. 잠열 소비 (온도 상승 억제)
  const heatConsumed = evaporationMass * WATER_LATENT_HEAT;  // J
  
  // 3. 표면 온도 낮추기 (에너지 균형)
  const Cₚ_beef = 3500;  // J/kg·K
  const mass_surface = beefMass / nodes.length;  // 표면 노드 질량
  nodes[0] -= heatConsumed / (mass_surface * Cₚ_beef);
  
  // 4. 수분 손실 게이지 업데이트
  totalWaterLossPercent += (evaporationMass / beefMass) * 100;
}
```

**물리적 의미**:
- 100°C에 도달한 표면이 **더 이상 온도 올라가지 않음** → 끓는 물 현상
- 분명히 더 강한 열이 들어오는데도 온도 정체
- 잠열이 모두 소비된 후에야 다시 온도 상승
- 이것이 **스테이크 표면 물기 제거 (드라이 프로세스)** 의 물리 원리

**수분 손실 vs 익힘도**:

| 심부 온도 | 수분 손실 | 물리적 이유 |
|-----------|----------|----------|
| 49°C (Rare) | 2% | 표면 110°C 정도, 약간의 증발 |
| 54°C (Medium Rare) | 4% | 표면 120°C, 100°C 구간 통과 |
| 60°C (Medium) | 6% | 표면 140°C, 더 많은 증발 |
| 66°C (Medium Well) | 12% | 표면 150°C, 상당한 수분 손실 |
| 71°C (Well Done) | 18% | 표면 165°C, 심한 건조화 |

---

## Gemini Vision 연동

### API 호출

```javascript
async function analyzeSteak(base64Image) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image
              }
            },
            {
              text: `Analyze this steak image and return ONLY valid JSON, no markdown:
              {
                "cut": "tenderloin|strip|ribeye",
                "fat_percent": <0-100>,
                "thickness_cm": <number>,
                "grade": "prime|choice|select"
              }`
            }
          ]
        }]
      })
    }
  );
  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}
```

### Gemini 결과 → 슬라이더 자동 세팅

```javascript
function applyGeminiResult(result) {
  // 슬라이더 자동 업데이트
  thicknessSlider.value = result.thickness_cm;
  cutSelect.value = result.cut;

  // α값 보정
  currentAlpha = PROPERTIES[result.cut].alpha * (1 - result.fat_percent * 0.003);

  // UI 피드백
  showToast(`🔬 Gemini 분석 완료: ${result.cut}, 지방 ${result.fat_percent}%, 두께 ${result.thickness_cm}cm`);
}
```

---

## 히트맵 시각화

### 온도 → 색상 매핑

*The Food Lab* 실험 데이터 기반 온도 구간:

```javascript
function tempToColor(t) {
  if (t < 49)  // Rare 미만: 파랑 계열
    return `rgb(${lerp(30, 200, t/49)}, ${lerp(50, 80, t/49)}, 220)`;
  if (t < 54)  // Rare~Medium Rare: 분홍
    return `rgb(220, ${lerp(80, 40, (t-49)/5)}, ${lerp(160, 80, (t-49)/5)})`;
  if (t < 60)  // Medium Rare~Medium: 연한 갈색
    return `rgb(200, ${lerp(60, 30, (t-54)/6)}, 40)`;
  if (t < 71)  // Medium Well: 갈색
    return `rgb(${lerp(180, 120, (t-60)/11)}, 25, 15)`;
  return `rgb(80, 20, 10)`;  // Well Done: 짙은 갈색
}

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
```

### 수분 손실 게이지

**신규 수분 증발 모델** (위 "수분 증발 모델" 섹션)과 연동:

- 표면 온도 < 100°C: 매우 느린 증발 (무시해도 무방)
- 표면 온도 ≥ 100°C: **잠열 소비** → 온도 정체 → 표면 수분 빠르게 손실
- 노드별 누적 증발량 통합 계산

**시뮬레이션 결과 데이터** (*The Food Lab* 실험값과 비교):

| 심부 온도 | 표면 온도 (예상) | 수분 손실 | 표시 | 물리적 의미 |
|-----------|----------|----------|------|-----------|
| 49°C (Rare) | ~110°C | 2% | 💧💧💧💧💧 | 표면만 끓임, 심부 거의 생상태 |
| 54°C (Medium Rare) | ~120°C | 4% | 💧💧💧💧 | 100°C 경계면 형성, 중등도 증발 |
| 60°C (Medium) | ~140°C | 6% | 💧💧💧 | 뚜렷한 수증기 발생 |
| 66°C (Medium Well) | ~150°C | 12% | 💧💧 | 표면 건조화 시작 |
| 71°C (Well Done) | ~165°C | 18% | 💧 | 심한 수분 손실, 식감 거칠어짐 |

---

## 애니메이션

### 뒤집기 애니메이션

```css
.steak-visual {
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}
.steak-visual.flipping {
  transform: rotateX(90deg);
}
/* JS로 flipping 클래스 제거 시 원위치로 복귀 */
```

### CUT 버튼 — 단면 공개

- 버튼 클릭 시 히트맵이 세로로 슬라이드 오픈
- 각 노드의 최종 온도로 익힘 정도 레이블 표시
- "당신의 스테이크: **Medium Rare** ✅" 판정

---

## 배포 설정

```
GitHub repo
└── index.html   ← 모든 코드 (HTML + CSS + JS)

Vercel → Import Git Repository → 자동 배포
→ https://{project-name}.vercel.app
```

**API Key 처리**: 해커톤 데모용이므로 `index.html` 내 상수로 하드코딩.
실서비스라면 환경변수 처리 필요.

---

## 참고 문헌

- J. Kenji López-Alt, *The Food Lab* (2015) — 뒤집기 횟수 실험, carry-over cooking 데이터, Maillard 반응 온도, 수분 손실 vs 온도 차트
- Incropera et al., *Fundamentals of Heat and Mass Transfer* — 1D FDM 수치해석
- USDA Meat Science — 부위별 열확산율 (α) 문헌값