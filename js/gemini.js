// Gemini Vision API — steak cut classification and fat estimation only
// Thickness is entered manually by the user

let geminiApiKey = 'AIzaSyDwM6UjNxU4yX1y2vYD1ri133qCQKw_Ukg';

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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
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

// Convert base64 image from <input type="file">
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // strip data URL prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
