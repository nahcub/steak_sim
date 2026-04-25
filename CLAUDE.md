# STEAK SIM — CLAUDE.md

GDG 해커톤 프로젝트. 스테이크 심부 온도를 **1D 비정상 열전도 PDE + 유한차분법(FDM)** 으로 계산하는 물리 시뮬레이터.

---

## 프로젝트 구조

```
steak_simulator/
├── index.html          ← 진입점, 모든 JS를 <script>로 로드 (번들러 없음)
├── css/
│   └── main.css        ← 전체 스타일 (토큰 기반, 다크모드 미지원)
├── js/
│   ├── constants.js    ← 물성치 룩업테이블, 시뮬 파라미터
│   ├── physics.js      ← FDM 엔진 (PDE, 경계조건, 뒤집기, REST)
│   ├── reactions.js    ← Arrhenius 반응속도론 (마이야르, 단백질 변성)
│   ├── ui.js           ← 캔버스 렌더링, DOM 업데이트, 토스트
│   ├── gemini.js       ← Gemini 1.5 Flash Vision API 통신
│   └── app.js          ← 상태 관리, 게임 루프(rAF), 이벤트 리스너
├── design/
│   └── flyingpan.png   ← 팬 이미지 (pan-canvas 배경)
└── plan.md             ← 원래 설계 문서
```

---

## 물리 엔진 (physics.js)

### 지배 방정식
1D 비정상 열전도:
```
∂T/∂t = α · ∂²T/∂x²
α = k / (ρ · Cp)
```

### FDM 이산화 (stepFDM)
- **노드 수**: N=20, nodes[0]=팬면, nodes[19]=공기면
- **내부 노드**: `T_i(t+Δt) = T_i + r·(T_{i+1} - 2T_i + T_{i-1})`, r = α·Δt/Δx²
- **안정성 조건**: r ≤ 0.5 (Δt=0.5s 기준 충족)
- **하단 BC (팬면)**: Dirichlet — `T[0] = panTemp`
- **상단 BC (공기면)**: Robin — `-k·∂T/∂x = h·(T_top - T_air)`, h=15 W/m²·K

### 팬 온도 동적 계산 (updatePanTemp)
매 timestep마다 에너지 균형:
```
ΔT_pan = (P_burner·Δt - q_steak·A·Δt) / (m_pan · Cp_pan)
q_steak = k_beef · (T_pan - T_node0) / Δx
```
버너 파워 변경은 즉시 반영 (버너 자체의 열관성 없음 — 의도적 단순화).

### REST 모드 (stepRest)
양면 모두 Robin BC (h=15, T_air=22°C), 버너 off.
carry-over cooking이 자연 발생 (심부 온도가 잠깐 더 오른 후 냉각).

### 뒤집기 (flipSteak)
`nodes.reverse()` + panTemp = 구 공기면 온도. crustFront/crustBack도 swap.

---

## 반응 모델 (reactions.js)

### 마이야르 반응 (크러스트)
```
dM/dt = A_M · exp(-Ea_M / RT),  T > 140°C 일 때만
A_M = 1e8,  Ea_M = 70,000 J/mol
```
crustFront (nodes[0]), crustBack (nodes[19]) 각각 독립 추적.

### 단백질 변성 (익힘도)
```
dD/dt = A_P · exp(-Ea_P / RT)
A_P = 1e37,  Ea_P = 250,000 J/mol
```
20개 노드 각각 독립적으로 변성도(0~1) 누적. 팬 캔버스 색상에 반영.

### 익힘도 판정
심부 온도(nodes[10]) 기준 — constants.js의 DONENESS 룩업테이블 (52/57/63/68/74°C 경계).

---

## 상수 (constants.js)

| 상수 | 값 | 비고 |
|------|-----|------|
| BEEF_K | 0.5 W/m·K | 열전도율 |
| BEEF_RHO | 1050 kg/m³ | 밀도 |
| BEEF_CP | 3500 J/kg·K | 비열 |
| STEAK_AREA | 0.02 m² | 접촉 면적 |
| N_NODES | 20 | FDM 노드 수 |
| DT | 0.5 s | 시뮬 타임스텝 |
| H_CONV | 15 W/m²·K | 자연대류 계수 |
| T_AIR | 22 °C | 주변 온도 |
| PAN_INITIAL_TEMP | 220 °C | 팬 초기온도 |

### 열확산율 α 룩업테이블
| 부위 | α (m²/s) |
|------|----------|
| 안심(tenderloin) | 1.35e-7 |
| 등심(strip) | 1.25e-7 |
| 립아이(ribeye) | 1.10e-7 |

Gemini fat_percent 보정: `α = α_base × (1 - fat_percent × 0.003)`

### 팬 물성치
| 팬 | Cp (J/kg·K) | 질량(kg) |
|----|-------------|---------|
| 무쇠팬 | 460 | 2.5 |
| 스테인레스 | 500 | 1.2 |
| 코팅팬 | 900 | 0.6 |

---

## 게임 루프 (app.js)

고정 타임스텝 accumulator 방식 (실시간 고정):
```
accumulator += min(frameMs, 200ms) / 1000
while accumulator >= DT:
    panTemp = updatePanTemp(...)
    nodes   = stepFDM(...)
    crustFront = updateMaillard(crustFront, nodes[0])
    crustBack  = updateMaillard(crustBack,  nodes[19])
    denaturation = updateDenaturation(denaturation, nodes)
    simSecs += DT; accumulator -= DT
```
탭 숨김 후 재활성화 시 나선형 폭발 방지: frameMs 200ms 캡.

---

## UI 렌더링 (ui.js)

### 히트맵 캔버스 (heatmap-canvas)
- **방향**: 세로 — 상단=공기면(nodes[19]), 하단=팬면(nodes[0])
- **컬러맵**: 과학적 jet-like (파랑→시안→초록→노랑→빨강, 4~240°C 범위)
- 우측에 컬러바(colorbar-canvas) 함께 렌더링

### 팬 캔버스 (pan-canvas)
- design/flyingpan.png 위에 스테이크를 직접 그림
- 기본: 측면 뷰 (core 온도 + crustFront/Back 혼합 그라디언트)
- 단면공개 시: 노드별 밴드 표시 + 익힘도 라벨

### 색상 매핑 (pan canvas용)
고기 실제 색상 기반 (Raw=진홍 → Medium Rare=핑크 → Well Done=갈색).
히트맵은 별도의 `tempToHeatmapRGB()` 사용 (과학적 컬러맵).

---

## Gemini Vision 연동 (gemini.js)

- 모델: `gemini-1.5-flash`
- 반환값: `{ cut, fat_percent }` (두께는 사용자 직접 입력)
- API 키 기본값 하드코딩 (해커톤 데모용) — 헤더 우측 "API KEY" 버튼으로 변경 가능
- 실패 시 null 반환 → caller에서 수동 입력 안내

---

## 레이아웃 구조

```
┌── HEADER (48px) ─────────────────────────────────┐
│ STEAK SIM | 부위  [Raw] [22°C] [0:00]  [API KEY] │
├── LEFT (flex 1) ────┬── RIGHT (320px) ────────────┤
│ 사진분석            │ 단면 온도 분포  [단면공개]    │
│ [부위][팬]          │ 공기면                       │
│ [두께][초기온도]    │  ┌──────────────┐ ┐colorbar│
│                     │  │ heatmap      │ │        │
│  [팬 캔버스]        │  │ (세로/jet)   │ │        │
│                     │  └──────────────┘ ┘        │
│                     │ 팬면                         │
│                     │ Medium Rare – 54.2°C         │
│                     ├────────────────────────────  │
│                     │ 크러스트 앞/뒤 게이지         │
│                     ├────────────────────────────  │
│                     │ 뒤집기 N회  시뮬 Ns          │
├── FOOTER (108px) ───────────────────────────────── │
│ [약불][중불][강불][최강]          팬 220°C          │
│ [▶ START]  [↩ 뒤집기]  [☁ 레스팅]                 │
└────────────────────────────────────────────────────┘
```

---

## 미구현 항목 (plan.md 대비)

1. **수분 증발 모델** (`evaporation.js` 미생성)
   - 표면 ≥100°C 시 잠열 소비로 온도 정체 효과 없음
   - 수분 손실 % 게이지 미동작

2. **뒤집기 CSS 애니메이션**
   - plan.md의 `rotateX(90deg)` flip 애니메이션 미구현
   - 뒤집기 시 시각적 피드백 없음 (토스트 텍스트만 표시)

---

## 배포

Vercel (GitHub 연동 자동 배포). API 키 하드코딩 상태이므로 실서비스 전 환경변수 처리 필요.
