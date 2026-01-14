import { GoogleGenAI, Type } from "@google/genai";
import { Platform, ScriptParams, TopicResult, AuditResult, GroundingMetadata } from "../types";

// Helper to get client with current key
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

// 1. Topic Research with Search Grounding
export const researchTopics = async (query: string, domain: string, platform: Platform): Promise<TopicResult[]> => {
  const ai = getAiClient();
  
  const prompt = `
    你是一位短视频爆款内容策略专家。
    基于用户的请求："${query}"，在"${domain}"领域内，寻找 5 个热门或具有爆款潜力的短视频选题。
    请重点考虑适合 ${platform} 平台的内容。
    
    请使用 Google 搜索查找实时趋势、新闻或最近的爆款视频作为依据。
    
    请严格以 JSON 数组格式返回结果，**所有文本内容必须使用中文**。
  `;

  // We ask for JSON text, but we also use search tools. 
  // Note: Grounding usually returns text, so we ask the model to format the found info into JSON.
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            relevanceScore: { type: Type.NUMBER, description: "Score from 1 to 100" },
            trendingReason: { type: Type.STRING, description: "Why is this trending now?" }
          },
          required: ["title", "description", "relevanceScore", "trendingReason"]
        }
      }
    }
  });

  const rawJson = response.text || "[]";
  let results: TopicResult[] = [];
  
  try {
    results = JSON.parse(rawJson);
  } catch (e) {
    console.error("Failed to parse topic JSON", e);
    return [];
  }

  // Extract grounding metadata to attach sources if available
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[];
  
  // Distribute sources loosely to the results (approximation since mapping strict chunks to JSON items is complex)
  // Or simply attach relevant top links to the first item for display purposes in this demo
  const sources = groundingChunks
    ?.filter(c => c.web)
    .map(c => ({ title: c.web.title, url: c.web.uri })) || [];

  if (results.length > 0 && sources.length > 0) {
    results[0].sources = sources.slice(0, 3);
  }

  return results;
};

// 2. Script Generation
export const generateVideoScript = async (params: ScriptParams): Promise<string> => {
  const ai = getAiClient();

  const prompt = `
    为 ${params.platform} 平台创作一个爆款短视频脚本。
    主题: ${params.topic}
    目标受众: ${params.targetAudience}
    基调: ${params.tone}
    预计时长: ${params.durationSeconds} 秒。

    请**使用中文**并在 Markdown 格式中包含以下部分：
    - **黄金前 3 秒 (Hook)**: 视觉/听觉钩子，目的是阻止用户划走。
    - **内容主体**: 核心价值或故事（分场景描述）。
    - **CTA (行动号召)**: 引导关注或互动。
    - **视觉提示**: 镜头角度、画面描述、文字贴纸。
    - **音频提示**: 背景音乐风格、音效。
    
    请在最后简要解释一下这开头 (Hook) 背后的策略。
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', // Stronger reasoning for creative writing
    contents: prompt,
  });

  return response.text || "生成脚本失败。";
};

// 3. Content Audit (Multimodal)
export const auditContent = async (
  fileBase64: string, 
  mimeType: string, 
  context: string
): Promise<AuditResult> => {
  const ai = getAiClient();

  const prompt = `
    分析这个上传的素材（视频/图片/音频/文本），目标是制作成短视频。
    用户提供的背景信息："${context}"。
    
    请基于以下维度进行批判性评估（**请用中文回答**）：
    1. 吸引力 (Hook 能力)
    2. 节奏与清晰度
    3. 视听质量
    4. 爆款潜力
    
    请提供 JSON 格式的响应，包含：
    - score (1-100 分)
    - strengths (字符串数组，优点)
    - weaknesses (字符串数组，缺点)
    - suggestions (字符串数组，具体的修改建议)
    - viralPotential (枚举值: 'Low', 'Medium', 'High', 'Very High')
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview', // Supports multimodal
    contents: {
      parts: [
        { inlineData: { mimeType, data: fileBase64 } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: 'application/json',
       responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          viralPotential: { type: Type.STRING, enum: ['Low', 'Medium', 'High', 'Very High'] }
        },
        required: ["score", "strengths", "weaknesses", "suggestions", "viralPotential"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    throw new Error("Failed to parse audit result");
  }
};

// 4. General Assistant Chat
export const chatWithAssistant = async (history: {role: string, parts: {text: string}[]}[], newMessage: string) => {
  const ai = getAiClient();
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    history: history,
    config: {
      systemInstruction: "你是一个短视频创作应用的专家助手。请用中文回答。保持回答简洁、鼓舞人心，并专注于视频制作、平台算法和创意激发。",
    }
  });

  const result = await chat.sendMessageStream({ message: newMessage });
  return result;
};
