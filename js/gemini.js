// Gemini Vision API — steak cut classification and fat estimation only
// Thickness is entered manually by the user

let geminiApiKey = '';

function setGeminiApiKey(key) {
  geminiApiKey = key.trim();
}

function getGeminiApiKey() {
  return geminiApiKey;
}

async function analyzeSteak(base64Image) {
  if (!geminiApiKey) {
    throw new Error('Gemini API 키가 설정되지 않았습니다.');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              text: `Analyze this steak image. Return ONLY valid JSON with no markdown:
{
  "cut": "tenderloin" | "strip" | "ribeye",
  "fat_percent": <integer 0-100>
}`,
            },
          ],
        }],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`API 오류: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (!PROPERTIES[parsed.cut]) parsed.cut = 'strip'; // fallback
    parsed.fat_percent = Math.max(0, Math.min(100, parseInt(parsed.fat_percent) || 0));
    return parsed;
  } catch {
    return null; // caller shows manual input fallback
  }
}

// Generate a chef review of the cooked steak based on simulation stats
async function generateSteakReview({ cut, doneness, coreTemp, crustFront, crustBack, waterLoss, flipCount, simSecs }) {
  const cutLabel = { tenderloin: '안심', strip: '등심', ribeye: '립아이' }[cut] || cut;
  const m = Math.floor(simSecs / 60);
  const s = Math.floor(simSecs % 60);
  const timeStr = m > 0 ? `${m}분 ${s}초` : `${s}초`;

  const prompt = `당신은 미슐랭 3스타 셰프입니다. 아래 스테이크 조리 데이터를 보고 한국어로 짧고 날카로운 셰프 리뷰를 작성해주세요. 2~3문장, 반말 금지, 존댓말 사용. 조리 결과를 칭찬하거나 날카롭게 비판하되 구체적인 수치를 언급하세요.

부위: ${cutLabel}
익힘도: ${doneness} (심부 ${coreTemp.toFixed(1)}°C)
앞면 크러스트: ${crustFront}%
뒷면 크러스트: ${crustBack}%
수분 손실: ${waterLoss.toFixed(1)}%
뒤집기 횟수: ${flipCount}회
총 조리 시간: ${timeStr}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) throw new Error(`API 오류: ${response.status}`);

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
}

// Convert base64 image from <input type="file">
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // strip data URL prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
