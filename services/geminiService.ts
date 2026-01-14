import { GoogleGenAI, Type, Chat } from "@google/genai";
import { Platform, ScriptParams, TopicResult } from "../types";

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

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[];
  
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
    model: 'gemini-3-pro-preview', 
    contents: prompt,
  });

  return response.text || "生成脚本失败。";
};

// 3. Multi-File Interactive Audit Session
export const createAuditSession = async (
  files: { data: string; mimeType: string }[],
  context: string
): Promise<{ chat: Chat; initialResponseStream: any }> => {
  const ai = getAiClient();

  // Initialize a chat session specifically for this audit
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview', // High context window for multiple files
    config: {
      systemInstruction: "你是一位资深的短视频内容导演和算法专家。用户会上传一个或多个素材（视频、图片、文档）。请综合分析这些素材，指出优缺点，并给出具体的修改建议。在后续对话中，你需要协助用户优化方案，直到生成最终执行计划。请始终使用中文回答，格式清晰，使用 Markdown。",
    },
  });

  // Prepare the first message with all files
  const parts: any[] = [];
  
  // 1. Add all files as inline data
  files.forEach(f => {
    parts.push({
      inlineData: {
        mimeType: f.mimeType,
        data: f.data
      }
    });
  });

  // 2. Add the text prompt
  const initialPrompt = `
    我对这些上传的素材进行了整理。
    背景/目标：${context || "暂无特殊背景，请以打造爆款为目标"}。

    请对这些文件进行**综合诊断**：
    1. **整体评分与简评**：给这组素材打分（1-100），并一句话总结。
    2. **单项分析**：如果只是一个文件，详细分析。如果是多个，请对比分析它们之间的关联、一致性或优劣。
    3. **黄金前3秒 (Hook)**：评估开头吸引力。
    4. **爆款潜力预估**：(Low/Medium/High/Very High)。
    5. **改进建议**：给出 3-5 条最关键的可执行建议。

    请用 Markdown 格式输出分析报告。
  `;
  parts.push({ text: initialPrompt });

  // Send the initial complex message
  // We return the stream so the UI can show it typing
  const initialResponseStream = await chat.sendMessageStream({
    message: parts
  });

  return { chat, initialResponseStream };
};

// Send follow-up messages in the audit session
export const sendAuditMessage = async (chat: Chat, message: string) => {
  return await chat.sendMessageStream({ message });
};

// Generate final plan based on history
export const generateFinalPlan = async (chat: Chat): Promise<string> => {
  const prompt = "基于我们之前的分析和讨论，请总结出一份最终的《爆款短视频优化与执行方案》。请包含：最终确定的脚本结构、视觉风格建议、BGM选择以及发布策略。格式要是结构清晰的 Markdown，方便我直接下载保存。";
  const result = await chat.sendMessage({ message: prompt });
  return result.text || "生成方案失败";
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