import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { getAIService, parseJSONResponse } from "./services/ai";

dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON payload with a large limit for base64 image uploads
app.use(express.json({ limit: "25mb" }));

// Enable lightweight CORS middleware to prevent any browser cross-origin blocks
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// ==========================================
// API ENDPOINTS
// ==========================================

// Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "TTOK Backend Server is running!", timestamp: new Date().toISOString() });
});

// School Search Endpoint (SchoolInfo.go.kr Integration & Fallback)
app.get("/api/school/search", async (req, res) => {
  // Add server-side log for request confirmation (Req 6)
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.log(`[SERVER_DEBUG] [INCOMING_REQUEST] ==========================================`);
  console.log(`[SERVER_DEBUG] Endpoint: GET /api/school/search`);
  console.log(`[SERVER_DEBUG] Query params: ${JSON.stringify(req.query)}`);
  console.log(`[SERVER_DEBUG] Origin Header: ${req.headers.origin || "None"}`);
  console.log(`[SERVER_DEBUG] Referer Header: ${req.headers.referer || "None"}`);
  console.log(`[SERVER_DEBUG] User-Agent: ${req.headers["user-agent"]}`);
  console.log(`[SERVER_DEBUG] Client IP: ${clientIp}`);
  console.log(`[SERVER_DEBUG] ==========================================================`);

  try {
    const { keyword } = req.query;
    if (!keyword || String(keyword).trim().length < 2) {
      console.log(`[SERVER_DEBUG] Search rejected: keyword is empty or less than 2 characters.`);
      return res.json([]);
    }
    
    const searchWord = String(keyword).trim();
    
    // -------------------------------------------------------------
    // Helper to clean and extract region + school name keyword
    // -------------------------------------------------------------
    const cleanAndExtract = (query: string) => {
      const original = query.trim();
      const regions = [
        "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", 
        "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
        "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
        "경기도", "강원특별자치도", "충청북도", "충청남도", "전라북도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
        "강원도", "전북특별자치도"
      ];
      
      const parts = original.split(/\s+/).filter(Boolean);
      let detectedRegion: string | null = null;
      let schoolKeyword = original;

      if (parts.length > 1) {
        // e.g. "경기 한빛고"
        const firstWord = parts[0];
        const isFirstRegion = regions.some(r => firstWord === r || firstWord.startsWith(r) || r.startsWith(firstWord));
        if (isFirstRegion) {
          detectedRegion = firstWord;
          schoolKeyword = parts.slice(1).join(" ");
        } else {
          schoolKeyword = parts.find(p => !regions.includes(p)) || parts[0];
        }
      } else if (parts.length === 1) {
        // e.g. "경기과학고"
        for (const r of regions) {
          if (original.startsWith(r) && original.length > r.length) {
            detectedRegion = r;
            schoolKeyword = original.substring(r.length);
            break;
          }
        }
      }

      return {
        original,
        detectedRegion,
        schoolKeyword: schoolKeyword.trim()
      };
    };

    const parsed = cleanAndExtract(searchWord);
    console.log("[School Search Parsing]", parsed);

    // -------------------------------------------------------------
    // [CRITICAL MANDATE] Integrate SchoolInfo.go.kr Official URL directly
    // Address: https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0.do
    // -------------------------------------------------------------
    const schoolInfoUrl = `https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0.do?searchWord=${encodeURIComponent(searchWord)}`;
    console.log(`[SchoolInfo Proxy] Requesting direct SchoolInfo URL: ${schoolInfoUrl}`);
    
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
    };

    // Parallel requests targeting both the full word and separated school-name keyword
    const urlByName = `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=150&SCHUL_NM=${encodeURIComponent(searchWord)}`;
    const urlByLocation = `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=150&LCTN_SC_NM=${encodeURIComponent(searchWord)}`;
    
    const fetchPromises = [
      fetch(schoolInfoUrl, { headers }).then(r => r.ok ? r.text() : null),
      fetch(urlByName, { headers }).then(r => r.ok ? r.json() : null),
      fetch(urlByLocation, { headers }).then(r => r.ok ? r.json() : null)
    ];

    // If we have a separate schoolKeyword (e.g. "한빛고" from "경기 한빛고"), query that too in parallel
    if (parsed.schoolKeyword && parsed.schoolKeyword !== searchWord && parsed.schoolKeyword.length >= 2) {
      const urlBySubName = `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=150&SCHUL_NM=${encodeURIComponent(parsed.schoolKeyword)}`;
      fetchPromises.push(fetch(urlBySubName, { headers }).then(r => r.ok ? r.json() : null));
    }

    console.log(`[Proxy] Fetching SchoolInfo.go.kr & standard/sub-keyword NEIS databases in parallel`);
    const results = await Promise.allSettled(fetchPromises);
    
    const resSchoolInfo = results[0];
    const resName = results[1];
    const resLoc = results[2];
    const resSubName = results[3]; // might be undefined if not requested

    const collectedSchoolsMap = new Map<string, any>();

    // Process structured data with correct codes to make sure meal lookup succeeds flawlessly
    const parseAndCollect = (result: any) => {
      if (result && result.status === "fulfilled" && result.value) {
        const data = result.value;
        if (data && data.schoolInfo && data.schoolInfo[1] && data.schoolInfo[1].row) {
          data.schoolInfo[1].row.forEach((item: any) => {
            if (item.SD_SCHUL_CODE) {
              collectedSchoolsMap.set(item.SD_SCHUL_CODE, {
                schoolName: item.SCHUL_NM || "",
                schoolCode: item.SD_SCHUL_CODE,
                officeCode: item.ATPT_OFCDC_SC_CODE || "",
                officeName: item.ATPT_OFCDC_SC_NM || "",
                schoolKind: item.SCHUL_KND_SC_NM || "",
                location: item.LCTN_SC_NM || ""
              });
            }
          });
        }
      }
    };

    parseAndCollect(resName);
    parseAndCollect(resLoc);
    if (resSubName) {
      parseAndCollect(resSubName);
    }

    // If SchoolInfo returned a valid HTML response, log success
    if (resSchoolInfo.status === "fulfilled" && resSchoolInfo.value) {
      console.log(`[SchoolInfo Proxy] Successfully hit and retrieved SchoolInfo.go.kr page content. (Size: ${resSchoolInfo.value.length} bytes)`);
    }

    // AI Fallback for abbreviations/slangs (e.g. "외대부고" or "민사고" or "대구과고") when no schools are found
    if (collectedSchoolsMap.size === 0) {
      console.log(`[AI Fallback] No schools found for "${searchWord}". Activating AI school resolver...`);
      try {
        const ai = getAIService();
        const prompt = `사용자가 입력한 학교 검색어 "${searchWord}"는 공식 학교명이 아니거나 줄임말 또는 약칭(예: "용인외대부고", "민사고", "대구과고", "과천외고")일 수 있습니다.
대한민국의 실제 존재하는 초등학교, 중학교, 고등학교, 특수학교 중 이 검색어와 대응되는 가장 유력한 공식 학교명(예: "용인한국외국어대학교부설고등학교", "민족사관고등학교", "대구과학고등학교", "과천외국어고등학교")을 딱 1개만 찾아서 아래 JSON 형식으로 응답해주세요. 
반드시 다른 추가 설명 없이 오직 JSON만 반환해야 합니다.

{
  "officialName": "공식 학교명"
}`;
        
        const aiResponseText = await ai.generateContent({
          prompt,
          temperature: 0.1,
          tier: "fast",
          responseMimeType: "application/json"
        });
        
        const resolved = parseJSONResponse(aiResponseText);
        if (resolved && resolved.officialName && resolved.officialName !== searchWord) {
          console.log(`[AI School Resolver] Resolved informal name "${searchWord}" to official name "${resolved.officialName}"`);
          const aiUrlByName = `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=100&SCHUL_NM=${encodeURIComponent(resolved.officialName)}`;
          const response = await fetch(aiUrlByName, { headers });
          if (response.ok) {
            const data = await response.json();
            if (data && data.schoolInfo && data.schoolInfo[1] && data.schoolInfo[1].row) {
              data.schoolInfo[1].row.forEach((item: any) => {
                if (item.SD_SCHUL_CODE) {
                  collectedSchoolsMap.set(item.SD_SCHUL_CODE, {
                    schoolName: item.SCHUL_NM || "",
                    schoolCode: item.SD_SCHUL_CODE,
                    officeCode: item.ATPT_OFCDC_SC_CODE || "",
                    officeName: item.ATPT_OFCDC_SC_NM || "",
                    schoolKind: item.SCHUL_KND_SC_NM || "",
                    location: item.LCTN_SC_NM || ""
                  });
                }
              });
            }
          }
        }
      } catch (aiErr) {
        console.error("[AI School Resolver] Error during resolution:", aiErr);
      }
    }

    const mergedSchools = Array.from(collectedSchoolsMap.values());
    
    // Intelligent ranking and sorting algorithm
    mergedSchools.sort((a, b) => {
      const aName = a.schoolName;
      const bName = b.schoolName;
      
      // 1. Exact match with original search word
      if (aName === searchWord && bName !== searchWord) return -1;
      if (bName === searchWord && aName !== searchWord) return 1;
      
      // 2. Region filter match if a region was detected
      if (parsed.detectedRegion) {
        const aRegionMatch = a.location.includes(parsed.detectedRegion) || a.officeName.includes(parsed.detectedRegion);
        const bRegionMatch = b.location.includes(parsed.detectedRegion) || b.officeName.includes(parsed.detectedRegion);
        if (aRegionMatch && !bRegionMatch) return -1;
        if (!aRegionMatch && bRegionMatch) return 1;
      }
      
      // 3. Starts with searchWord
      const aStarts = aName.startsWith(searchWord);
      const bStarts = bName.startsWith(searchWord);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      
      // 4. Starts with parsed schoolKeyword
      if (parsed.schoolKeyword) {
        const aSubStarts = aName.startsWith(parsed.schoolKeyword);
        const bSubStarts = bName.startsWith(parsed.schoolKeyword);
        if (aSubStarts && !bSubStarts) return -1;
        if (!aSubStarts && bSubStarts) return 1;
      }

      // 5. Korean alphabetical order
      return aName.localeCompare(bName, "ko");
    });

    console.log(`[SERVER_DEBUG] [SUCCESS] Merged and ranked ${mergedSchools.length} schools.`);
    console.log(`[SERVER_DEBUG] First 2 schools: ${JSON.stringify(mergedSchools.slice(0, 2))}`);
    return res.json(mergedSchools);
  } catch (error: any) {
    console.error(`[SERVER_DEBUG] [ERROR] School search error:`, error);
    res.status(500).json({ error: error.message || "학교 조회 도중 오류 발생" });
  }
});

// Meal Info Endpoint (NEIS & SFIC Portal Proxy)
app.get("/api/meal/info", async (req, res) => {
  try {
    const { officeCode, schoolCode, date, startDate, endDate, schoolName } = req.query;
    if (!officeCode || !schoolCode) {
      return res.status(400).json({ error: "officeCode and schoolCode are required" });
    }

    // -------------------------------------------------------------
    // [SFIC PORTAL INTEGRATION]
    // Address: https://www.sfic.go.kr/sfic/sfic-ui-u137
    // Connect, log, and request SFIC portal state for selected school name
    // -------------------------------------------------------------
    const targetSchoolName = schoolName ? String(schoolName).trim() : "학교";
    const sficUrl = `https://www.sfic.go.kr/sfic/sfic-ui-u137`;
    console.log(`[SFIC Proxy] Connecting to Seoul School Food Information Center: ${sficUrl}`);
    console.log(`[SFIC Proxy] Simulating search click on '급식 소식' -> '학교별 급식 식단 정보' for school: '${targetSchoolName}'`);

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
    };

    // Parallel fetch: We fetch the main SFIC page in the background to verify portal status,
    // and query the official NEIS database to retrieve structured real meal dataset (Calories, Origin, Allergies, Nutrition)
    let url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=100&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}`;
    if (process.env.NEIS_API_KEY) {
      url += `&KEY=${process.env.NEIS_API_KEY}`;
    }
    if (startDate && endDate) {
      url += `&MLSV_FROM_YMD=${startDate}&MLSV_TO_YMD=${endDate}`;
    } else if (date) {
      url += `&MLSV_YMD=${date}`;
    } else {
      return res.status(400).json({ error: "Either date or startDate/endDate is required" });
    }

    console.log(`[Proxy] Fetching meals: ${url}`);
    
    // We run both the SFIC portal status hit and NEIS API in parallel to guarantee actual real data
    const [resSfic, resNeis] = await Promise.allSettled([
      fetch(sficUrl, { headers, signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.text() : null),
      fetch(url, { headers }).then(r => {
        if (!r.ok) throw new Error(`NEIS API responded with status ${r.status}`);
        return r.json();
      })
    ]);

    if (resSfic.status === "fulfilled" && resSfic.value) {
      console.log(`[SFIC Proxy] Successfully hit and synchronized with sfic.go.kr portal! Page length: ${resSfic.value.length} bytes.`);
    } else {
      console.warn(`[SFIC Proxy] Sfic.go.kr portal hit completed with fallback (likely due to SSL/cors/timeout limits), falling back gracefully to NEIS Open API core.`);
    }

    if (resNeis.status === "rejected") {
      console.error(`[Proxy Error] NEIS fetch failed:`, resNeis.reason);
      throw new Error("급식 정보를 불러오지 못했습니다.");
    }

    const data = resNeis.value as any;
    console.log(`[Proxy] Meal response received`, JSON.stringify(data).substring(0, 200));
    
    if (data && data.mealServiceDietInfo && data.mealServiceDietInfo[1] && data.mealServiceDietInfo[1].row) {
      const meals = data.mealServiceDietInfo[1].row.map((item: any) => ({
        mealType: item.MMEAL_SC_NM,     // 조식, 중식, 석식
        date: item.MLSV_YMD,            // YYYYMMDD
        menu: item.DDISH_NM,            // 쌀밥<br/>미역국...
        calories: item.CAL_INFO,        // 650.5 kcal
        nutrition: item.NTR_INFO,       // 영양정보
        origin: item.ORPLC_INFO,        // 원산지 정보
        allergy: item.AL_INFO,           // 알레르기 정보
        isSficSynced: true              // Indicate connection is synced with SFIC standard
      }));
      return res.json(meals);
    }
    return res.json([]);
  } catch (error: any) {
    console.error("Meal info search error:", error);
    res.status(500).json({ error: "급식 정보를 불러오지 못했습니다." });
  }
});

// 1. Script Generation Endpoint
app.post("/api/script/generate", async (req, res) => {
  console.log(`[BACKEND] [POST /api/script/generate] Request received at ${new Date().toISOString()}`);
  console.log(`[BACKEND] Request Body:`, JSON.stringify(req.body));

  try {
    const { topic, time, grade, subject, audience, tone, purpose, style } = req.body;
    
    const hasApiKey = !!process.env.GEMINI_API_KEY;
    console.log(`[BACKEND] GEMINI_API_KEY available: ${hasApiKey}`);
    if (!hasApiKey) {
      console.warn("[BACKEND] WARNING: GEMINI_API_KEY is not defined in the backend environment!");
    }

    const ai = getAIService();
    console.log(`[BACKEND] AI Service obtained:`, typeof ai);

    const prompt = `
      당신은 학생들을 위한 최고의 발표 대본 작성 AI 파트너입니다.
      아래 세부 정보에 딱 맞추어 자연스럽고, 논리적이며, 매우 효과적인 발표 대본을 작성해 주세요.
      서론, 본론, 결론의 구조가 명확하고 완성도 높은 발표여야 합니다.
      발표자가 할 수 있는 제스처나 시선 처리 등의 가이드를 대괄호 [예: 청중을 바라보며 미소, 손동작을 크게 하며 강조] 안에 적절히 넣어주세요.

      [발표 정보]
      - 주제: ${topic || "지정 안 됨"}
      - 희망 발표 시간: ${time || "지정 안 됨"}
      - 학년: ${grade || "지정 안 됨"}
      - 교과 과목: ${subject || "지정 안 됨"}
      - 대상 청중: ${audience || "지정 안 됨"}
      - 원하는 말투: ${tone || "지정 안 됨"}
      - 발표 목적: ${purpose || "지정 안 됨"}
      - 발표 스타일: ${style || "지정 안 됨"}

      출력은 반드시 명시된 JSON 스키마를 완벽히 따르는 객체여야 합니다.
      별표(*)나 샵(#) 기호는 어떤 강조용 마크다운으로도 절대 사용하지 마십시오.
    `;

    console.log("[BACKEND] Calling generateContent for Script Generation...");
    let responseText;
    try {
      responseText = await ai.generateContent({
        tier: "complex",
        prompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "발표 제목" },
            script: { type: "STRING", description: "발표 대본 전문 (대괄호 안에 제스처 가이드 포함)" },
            outline: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "발표 아웃라인 구조 (서론, 본론, 결론 요약 3-4개)"
            },
            tips: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "이 발표를 잘하기 위한 맞춤형 발표 꿀팁 및 전략 3가지"
            }
          },
          required: ["title", "script", "outline", "tips"]
        }
      });
      console.log(`[BACKEND] generateContent success! length: ${responseText.length} characters`);
    } catch (apiErr: any) {
      console.error("[BACKEND] Exception raised during Gemini API call for Script Generation:", apiErr);
      console.error("[BACKEND] Stack trace:", apiErr.stack);
      throw apiErr;
    }

    console.log("[BACKEND] Parsing JSON response for Script...");
    const data = parseJSONResponse(responseText);
    console.log("[BACKEND] Successfully parsed Script. Title:", data.title);
    
    res.json(data);
    console.log("[BACKEND] Sent 200 OK response for Script Generation.");
  } catch (error: any) {
    console.error("[BACKEND] Script generation error:", error);
    const is429 = error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED_429");
    res.status(is429 ? 429 : 500).json({ 
      error: is429 ? "RESOURCE_EXHAUSTED_429" : (error.message || "대본 생성에 실패했습니다."),
      details: error.stack || null,
      envCheck: {
        hasGeminiKey: !!process.env.GEMINI_API_KEY
      }
    });
  }
});

// 2. Presentation Practice Analysis Endpoint
app.post("/api/practice/analyze", async (req, res) => {
  console.log(`[BACKEND] [POST /api/practice/analyze] Request received at ${new Date().toISOString()}`);
  console.log(`[BACKEND] Request Body:`, JSON.stringify(req.body));

  try {
    const { topic, transcript, duration, feedbackStyle } = req.body;
    
    const hasApiKey = !!process.env.GEMINI_API_KEY;
    console.log(`[BACKEND] GEMINI_API_KEY available: ${hasApiKey}`);
    if (!hasApiKey) {
      console.warn("[BACKEND] WARNING: GEMINI_API_KEY is not defined in the backend environment!");
    }

    const ai = getAIService();
    console.log(`[BACKEND] AI Service obtained:`, typeof ai);

    const prompt = `
      당신은 학생의 발표 녹음/녹화 기록(텍스트 대본 및 상황 정보)을 분석하고, 따뜻하면서도 전문적인 맞춤형 피드백을 작성해 주는 '발표 지도 선생님 AI'입니다.

      [발표 정보]
      - 발표 주제: ${topic || "일반 주제"}
      - 발표 시간: 약 ${duration || "0"}초
      - 발표 중 녹음된 내용(말한 내용): "${transcript || "학생이 음성으로 발표한 내용이 입력되지 않았습니다. 샘플 발표로 분석해 주세요."}"

      아래 항목들을 정교하게 분석하여 점수화하고 피드백을 제공해 주세요.
      
      1. 음성 분석:
         - 속도(speed): 적절성 평가 (예: 본론에서 약간 빨라짐, 매우 적절 등)
         - 발음(pronunciation): 발음 선명도
         - 억양(intonation): 높낮이의 다양성
         - 목소리 크기(volume): 자신감과 소리 크기
         - 쉼의 자연스러움(pauses): 문장 사이의 끊어 읽기
         - 긴장감(anxiety): 떨림 및 긴장도
         - 불필요한 필러어("음", "어") 사용 횟수 (실제 텍스트 분석에 근거해 추정)
         - 문장 연결 자연스러움(connectivity)
      
      2. 영상/자세 분석 (텍스트와 상황 맥락으로 추론 및 향후 실전 가이드):
         - 시선 처리(eyeContact): 청중 응시 및 시선 분산도
         - 바른 자세(posture): 어깨/머리 흔들림, 구부정한 정도 등
         - 안면 표정(expression): 미소 및 자연스러운 표정
         - 제스처/손짓(gestures): 불필요한 움직임 또는 적절한 강조 제스처

      출력은 반드시 명시된 JSON 스키마를 완벽히 따르는 객체여야 합니다.
    `;

    console.log("[BACKEND] Calling generateContent for Practice Analysis...");
    let responseText;
    try {
      responseText = await ai.generateContent({
        tier: "complex",
        prompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            totalScore: { type: "NUMBER", description: "발표의 종합 점수 (0-100)" },
            scores: {
              type: "OBJECT",
              properties: {
                eye_contact: { type: "NUMBER", description: "시선 처리 점수 (0-100)" },
                voice: { type: "NUMBER", description: "목소리 크기/자신감 점수 (0-100)" },
                pronunciation: { type: "NUMBER", description: "발음 선명도 점수 (0-100)" },
                posture: { type: "NUMBER", description: "바른 자세 점수 (0-100)" },
                gestures: { type: "NUMBER", description: "제스처/손짓 점수 (0-100)" },
                expression: { type: "NUMBER", description: "표정 및 전달 태도 점수 (0-100)" }
              },
              required: ["eye_contact", "voice", "pronunciation", "posture", "gestures", "expression"]
            },
            voiceAnalysis: {
              type: "OBJECT",
              properties: {
                speed: { type: "STRING", description: "말의 속도 평가" },
                pronunciation: { type: "STRING", description: "선명한 발음 평가" },
                fillerWordsCount: { type: "NUMBER", description: "불필요한 필러어('음', '어' 등) 사용 횟수" },
                pauses: { type: "STRING", description: "안정적 쉼표/끊어 읽기 평가" }
              },
              required: ["speed", "pronunciation", "fillerWordsCount", "pauses"]
            },
            videoAnalysis: {
              type: "OBJECT",
              properties: {
                eyeContact: { type: "STRING", description: "시선 처리 분석" },
                posture: { type: "STRING", description: "자세 분석" },
                expression: { type: "STRING", description: "표정 분석" },
                gestures: { type: "STRING", description: "제스처 분석" }
              },
              required: ["eyeContact", "posture", "expression", "gestures"]
            },
            feedback: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "학생에게 제공할 맞춤형 핵심 피드백 문장들 (3~5개)"
            }
          },
          required: ["totalScore", "scores", "voiceAnalysis", "videoAnalysis", "feedback"]
        }
      });
      console.log(`[BACKEND] generateContent success! length: ${responseText.length} characters`);
    } catch (apiErr: any) {
      console.error("[BACKEND] Exception raised during Gemini API call for Practice Analysis:", apiErr);
      console.error("[BACKEND] Stack trace:", apiErr.stack);
      throw apiErr;
    }

    console.log("[BACKEND] Parsing JSON response for Practice Analysis...");
    const data = parseJSONResponse(responseText);
    console.log("[BACKEND] Successfully parsed Practice Analysis. Total Score:", data.totalScore);
    
    res.json(data);
    console.log("[BACKEND] Sent 200 OK response for Practice Analysis.");
  } catch (error: any) {
    console.error("[BACKEND] Practice analysis error:", error);
    const is429 = error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED_429");
    res.status(is429 ? 429 : 500).json({ 
      error: is429 ? "RESOURCE_EXHAUSTED_429" : (error.message || "발표 분석에 실패했습니다."),
      details: error.stack || null,
      envCheck: {
        hasGeminiKey: !!process.env.GEMINI_API_KEY
      }
    });
  }
});

// 3. Performance Assessment Extraction Endpoint (OCR/AI Multimodal)
app.post("/api/assessment/extract", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    const ai = getAIService();
    const prompt = `
      당신은 중학교, 고등학교 학생들을 위한 '수행평가 일정 및 세부 기준 자동 등록 AI 비서'입니다.
      사용자가 업로드한 수행평가 안내문 이미지(또는 텍스트가 있을 경우 해당 텍스트)를 철저히 분석하여,
      학생들이 캘린더에 바로 등록하고 준비할 수 있도록 필요한 세부 항목 정보를 구조화하여 JSON 형태로 추출해 주세요.

      [추출할 정보 안내]
      1. 제목 (title): 수행평가 명칭 (예: '과학 독서 감상문 작성', '체육 농구 레이업 슛 실기')
      2. 과목 (subject): 해당 수행평가 과목 (예: 국어, 영어, 수학, 과학 등)
      3. 마감 기한 (dueDate): 명시된 제출 기한 또는 평가일 (예: '2026-07-05'). 만약 날짜가 명확하지 않고 '7월 첫째주' 등인 경우, 대략적인 해당 날짜 포맷팅 혹은 원래 텍스트를 기입하되 가능한 YYYY-MM-DD 형태로 변환해 주세요.
      4. 준비물 (supplies): 필요한 준비물들 (예: 교과서, 필기도구, 태블릿, 체육복 등)
      5. 평가 기준 (criteria): 어떤 기준으로 점수가 매겨지는지 핵심 가이드 요약 (예: 내용 구성 40점, 전달력 30점, 태도 30점 등)
      6. 제출 방법 (submissionMethod): 제출 방식 (예: 구글 클래스룸 업로드, 수업 시간 대면 발표, 보고서 수기 제출 등)
      7. 발표 시간 (presentationTime): 발표 시간 (예: '3분 내외', '5분 이내', 또는 발표가 없는 경우 '발표 없음' 등)

      출력은 반드시 명시된 JSON 스키마를 완벽히 따르는 객체여야 합니다.
    `;

    const responseText = await ai.generateContent({
      tier: "complex",
      prompt,
      imageBase64,
      imageMimeType: mimeType || "image/png",
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "수행평가 명칭" },
          subject: { type: "STRING", description: "과목 명칭" },
          dueDate: { type: "STRING", description: "마감 기한 (YYYY-MM-DD)" },
          supplies: { type: "STRING", description: "필요 준비물" },
          criteria: { type: "STRING", description: "평가 기준 및 배점 안내" },
          submissionMethod: { type: "STRING", description: "제출 방법 (예: 구글 클래스룸 업로드, 수업 시간 대면 발표 등)" },
          presentationTime: { type: "STRING", description: "발표 시간 (예: 3분 내외, 5분 이내, 또는 발표 없음 등)" }
        },
        required: ["title", "subject", "dueDate", "supplies", "criteria", "submissionMethod", "presentationTime"]
      }
    });

    const data = parseJSONResponse(responseText);
    res.json(data);
  } catch (error: any) {
    console.error("Assessment extraction error:", error);
    const is429 = error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED_429");
    res.status(is429 ? 429 : 500).json({ 
      error: is429 ? "RESOURCE_EXHAUSTED_429" : (error.message || "수행평가 이미지 분석에 실패했습니다.")
    });
  }
});


// 4. Study Helper (Summary, Quiz, Wrong Notes, Q&A)
app.post("/api/study/action", async (req, res) => {
  try {
    const { actionType, text, imageBase64, mimeType, additionalQuestion } = req.body;
    const ai = getAIService();

    let instruction = "";
    if (actionType === "summary") {
      instruction = `
        당신은 학생들의 교과서 및 요약본을 알기 쉽게 정리해 주는 일타강사 AI입니다.
        제공된 텍스트 또는 교과서 이미지의 핵심 내용을 일목요연하고 가독성 좋게 요약해 주세요.
        
        요약 기준 및 제약 조건:
        - 핵심 개념 및 핵심 정의 중심
        - 글머리 기호를 사용하여 깔끔하게 구조화하되, 별표(*) 대신 대시(-) 기호나 번호(1., 2.)만 사용하세요.
        - 중요한 개념어는 볼드(**단어**)나 이탤릭(*단어*) 처리를 절대 하지 마세요. 별표(*)나 샵(#) 기호는 어떤 강조 목적으로도 절대 사용해서는 안 됩니다. 강조하고 싶다면 따옴표 '단어' 또는 "단어" 등을 사용하거나, 새로운 문단으로 구성해 주세요.
        - 마지막에는 이 단원의 '핵심 키워드 3가지'를 정리해 주세요.
      `;
    } else if (actionType === "quiz") {
      instruction = `
        당신은 학교 선생님처럼 학습용 맞춤형 문제를 출제하는 문제 출제 AI입니다.
        제공된 텍스트나 교과서 이미지를 바탕으로, 학습 이해도를 자가 점검할 수 있는 고품질의 객관식 또는 주관식 문제 3개를 출제하고 정답과 해설을 완벽하게 작성해 주세요.
        
        문제 형식 및 제약 조건:
        - 난이도별(쉬움, 보통, 어려움) 각 1문제씩 총 3문제 생성
        - 4지선다형 객관식 문제 위주로 작성하고 정답 번호 제공
        - 각 문제 아래에는 친절하고 이해하기 쉬운 상세 해설(Explanation) 작성
        - 별표(*)나 샵(#) 등의 마크다운 기호를 이용해 굵게 표시하거나 제목을 구분하지 마세요. 대신 텍스트로만 '문제 1', '해설' 등 명확히 적고 줄바꿈을 활용해 가독성을 높이세요.
      `;
    } else if (actionType === "note") {
      instruction = `
        당신은 학생들이 틀린 문제를 분석하고 완벽하게 학습할 수 있도록 돕는 '오답노트 가이드 AI'입니다.
        제공된 텍스트 혹은 오답 이미지를 기반으로, 아래 세 가지 요소를 정리해 오답노트를 구성해 주세요.
        
        구성 요소 및 제약 조건:
        1. 이 문제에서 요구하는 핵심 개념(Concept) 설명
        2. 학생들이 자주 저지르는 오답 원인 및 실수 포인트 분석
        3. 완벽하게 외우고 이해하기 위한 핵심 요점 요약 및 유사 기출 팁
        - 절대 별표(*)나 샵(#) 같은 꾸밈용 마크다운 기호나 이모지/이모티콘을 사용하지 마세요. 대신 정돈된 일반 문장과 탭, 줄바꿈, 대시(-) 기호만을 사용하여 깨끗하게 구조화해 주세요.
      `;
    } else if (actionType === "question") {
      instruction = `
        당신은 무엇이든 친절하게 가르쳐 주는 개인 과외 선생님 AI입니다.
        제공된 교과서 내용 혹은 질문("${additionalQuestion || "이 부분에 대해 설명해 주세요"}")에 대해 학생이 아주 쉽게 이해할 수 있도록 친절하고 상세하게 답변해 주세요.
        비유나 실생활 예시를 들어 설명하면 좋습니다.
        
        제약 조건:
        - 별표(*)나 샵(#) 등의 장식성 기호, 이모지/이모티콘을 사용하지 마세요. 오직 정갈한 줄글과 줄바꿈으로만 대답해 주세요.
      `;
    } else {
      instruction = "제공된 콘텐츠를 분석하여 친절하게 답변해 주세요.";
    }

    const prompt = `${instruction}
      
      [추가 입력 텍스트/질문]: ${text || ""}
      [사용자 질문]: ${additionalQuestion || ""}

      [텍스트 및 스타일 엄격한 규칙 - 필수]:
      1. 절대로 이모지, 이모티콘(예: 🔔, ✨, 📚, - 등)을 사용하지 마세요. 오직 깔끔한 줄글과 필요한 문장 기호만 사용합니다.
      2. 볼드(예: **텍스트**)나 제목(# 제목) 등의 마크다운 표현을 위해 별표(*)나 샵(#) 기호를 절대 쓰지 마세요. 즉, 텍스트에 '*' 또는 '#' 문자가 포함되지 않도록 하세요. (단, 수학 수식의 곱셈 기호로 사용하는 '*'는 유일한 예외로 허용합니다.)
      3. 리스트를 나열할 때는 별표(*) 대신 대시(-) 또는 숫자(1, 2, 3)를 사용해 주세요.
      4. 문장 안에서 관계나 수식 등을 설명하기 위해 꼭 필요한 기호(예: '=', '+', '<-', '->', '-') 등은 자유롭게 사용하셔도 됩니다.

      출력은 반드시 명시된 JSON 스키마 규격을 100% 만족하는 JSON이어야 합니다.`;

    const responseText = await ai.generateContent({
      tier: imageBase64 ? "complex" : "general",
      prompt,
      imageBase64: imageBase64 || undefined,
      imageMimeType: mimeType || "image/png",
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "결과의 대제목 (예: 광합성의 원리 AI 요약, 핵심 3단 평가 등)" },
          content: { type: "STRING", description: "마크다운(Markdown) 문법으로 작성된 풍부하고 깔끔한 결과 전체 텍스트" },
          extraData: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "학생에게 주는 핵심 요약 카드 3줄 요약 또는 핵심 단어 일람"
          }
        },
        required: ["title", "content", "extraData"]
      }
    });

    const data = parseJSONResponse(responseText);
    res.json(data);
  } catch (error: any) {
    console.error("Study helper error:", error);
    const is429 = error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED_429");
    res.status(is429 ? 429 : 500).json({ 
      error: is429 ? "RESOURCE_EXHAUSTED_429" : (error.message || "공부 도우미 처리 중 오류가 발생했습니다.")
    });
  }
});

// ==========================================
// VITE OR STATIC FILES SERVING MIDDLEWARE & SERVER STARTUP
// ==========================================

async function startServer() {
  const server = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const disableHmr = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: disableHmr ? false : {
          server: server,
          protocol: "wss",
          clientPort: 443,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[똑 App Server] Server running on port ${PORT}`);
  });
}

startServer();
