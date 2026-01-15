
import { GoogleGenAI, Type, Chat } from "@google/genai";
import { Platform, ScriptParams, TopicResult, ChatMessage } from "../types";

// Helper to get client with current key
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

// 1. Topic Research with Search Grounding
export const researchTopics = async (query: string, domain: string, platform: Platform, batchIndex: number = 0): Promise<TopicResult[]> => {
  const ai = getAiClient();
  
  const prompt = `
    你是一位短视频爆款内容策略专家。
    任务：基于用户的请求 "${query}"，在 "${domain}" 领域内，寻找 5 个适合 **${platform}** 平台的爆款选题。
    
    【关键要求】
    1. **平台强相关**: 选题必须符合 **${platform}** 的用户偏好和算法机制。
    2. **来源限定**: 搜索并引用的参考视频链接（Sources）必须尽量来自 **${platform}** 平台本身 (例如 ${platform} 的网页版链接)。
    3. **多样性**: 这是用户请求的第 ${batchIndex + 1} 批次结果。请尝试寻找与之前不同的、更新颖或更冷门的爆款角度，不要重复常规内容。
    
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
  
  // Create a pool of sources
  const sources = groundingChunks
    ?.filter(c => c.web)
    .map(c => ({ title: c.web.title, url: c.web.uri })) || [];

  // Naive distribution of sources to topics just to ensure they have some links
  if (results.length > 0 && sources.length > 0) {
    results.forEach((res, idx) => {
        // Assign 1-2 unique sources to each result if available, otherwise reuse
        const start = (idx * 2) % sources.length;
        const topicSources = sources.slice(start, start + 2);
        if (topicSources.length > 0) {
            res.sources = topicSources;
        }
    });
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

// Send follow-up messages in the audit session (Supports files now)
export const sendAuditMessage = async (
  chat: Chat, 
  message: string,
  files?: { data: string; mimeType: string }[]
) => {
  const parts: any[] = [];
  
  // Add files if present
  if (files && files.length > 0) {
    files.forEach(f => {
      parts.push({
        inlineData: {
          mimeType: f.mimeType,
          data: f.data
        }
      });
    });
  }

  // Add text message
  parts.push({ text: message });

  return await chat.sendMessageStream({ message: parts });
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

// 5. Benchmark & Imitation

// Step 1 -> 2: Analyze (returns text, but used to init chat)
export const analyzeBenchmarkContent = async (
  url: string,
  file?: { data: string; mimeType: string }
): Promise<string> => {
  const ai = getAiClient();
  const parts: any[] = [];
  
  if (file) {
    parts.push({
      inlineData: { mimeType: file.mimeType, data: file.data }
    });
  }

  const prompt = `
  请深度剖析这个视频（或链接内容）：${url ? `链接: ${url}` : ''}。
  
  我需要一份**深度拆解报告**，作为我要模仿制作类似视频的依据。
  请**使用 Markdown** 并包含以下板块：

  1.  **核心亮点 (The Spark)**:
      *   这个视频为什么会火？（情绪价值、信息差、视觉冲击？）
      *   它的目标受众是谁？

  2.  **结构拆解 (Structure)**:
      *   **Hook (0-3秒)**: 它是如何抓住注意力的？（画面、声音、文案）
      *   **叙事节奏**: 内容是如何层层递进的？
      *   **CTA (结尾)**: 它是如何引导互动的？

  3.  **视听语言 (Audio/Visual)**:
      *   剪辑风格（快节奏、卡点、长镜头？）
      *   BGM 与音效的运用策略。
      *   画面色调与滤镜风格。

  4.  **优点与缺点**:
      *   ✅ 值得学习的优点。
      *   ❌ 可能存在的缺点或改进空间。

  请确保分析足够专业，能指导后续的创作。
  `;
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: {
      tools: [{ googleSearch: {} }], // Always enable search for URL analysis
    }
  });

  return response.text || "分析失败";
};

// Step 2: Interactive Chat Context
export const createBenchmarkChat = (initialAnalysis: string): Chat => {
  const ai = getAiClient();
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    history: [
       { role: 'user', parts: [{ text: "请帮我分析这个视频。" }] },
       { role: 'model', parts: [{ text: initialAnalysis }] }
    ],
    config: {
      tools: [{ googleSearch: {} }], // Enable search for interactive URL checking
      systemInstruction: "你正在协助用户分析一个标杆短视频。用户基于你的分析报告（已在历史记录中）可能会提出疑问、表达自己的想法，或者讨论如何修改。用户可能会上传额外的图片、视频或文档作为参考，请仔细查看并给出建议。如果用户发送链接，请使用搜索工具查看。请用中文回答，保持专业、敏锐。",
    }
  });
};

// Step 3 -> 4: Create Guide with history
export const createImitationSession = async (
  benchmarkAnalysis: string,
  userIdea: string,
  userAssets: { data: string; mimeType: string }[],
  conversationHistory: ChatMessage[] = []
): Promise<{ chat: Chat; initialResponseStream: any }> => {
  const ai = getAiClient();

  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      tools: [{ googleSearch: {} }], // Enable search for interactive URL checking
      systemInstruction: "你是一位短视频制作导师。你的任务是根据‘标杆视频的分析报告’，结合‘用户的创意和素材’，指导用户制作出一个具备同样爆款潜质的新视频。用户可能会在对话中上传新文件（PDF脚本、参考图、音频等），请综合分析。如果用户发送链接，请使用搜索工具查看。你的建议必须具体、可执行。始终使用 Markdown 格式。",
    }
  });

  const parts: any[] = [];
  userAssets.forEach(f => {
    parts.push({
      inlineData: { mimeType: f.mimeType, data: f.data }
    });
  });

  // Extract user insights from Step 2 chat to inform the guide
  const userInsights = conversationHistory
    .filter(m => m.role === 'user')
    .map(m => `- ${m.content}`)
    .join('\n');

  const prompt = `
  【任务目标】
  我想基于下方的“标杆视频分析”，制作一个我自己的视频。
  
  【标杆分析报告】
  ${benchmarkAnalysis}
  
  ${userInsights ? `【我之前的想法/讨论】\n${userInsights}\n` : ''}

  【我的新构思】
  ${userIdea || "暂无具体构思，请基于以上信息发挥。"}
  
  【我的素材】
  (已上传 ${userAssets.length} 个文件，请查看附件)
  
  【请输出】
  请为我生成一份**定制化的制作指南**：
  1.  **脚本大纲**: 模仿标杆的结构，填入我的内容。
  2.  **拍摄清单 (Shot List)**: 基于我的素材或需要补拍的镜头。
  3.  **剪辑指导**: 如何复刻标杆的剪辑节奏。
  4.  **创新点**: 结合我的讨论，如何做出我的特色？
  `;
  parts.push({ text: prompt });

  const initialResponseStream = await chat.sendMessageStream({ message: parts });
  return { chat, initialResponseStream };
};

// 6. Media Generation Functions

export const generateImage = async (prompt: string): Promise<{ base64: string, mimeType: string }> => {
  const ai = getAiClient();
  const model = 'gemini-2.5-flash-image'; 
  
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ text: prompt }]
    },
  });

  // Find image part in the response
  for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
          if (part.inlineData) {
              return {
                  base64: part.inlineData.data,
                  mimeType: part.inlineData.mimeType
              };
          }
      }
  }
  throw new Error("生成图片失败，请重试。");
};

export const generateVideo = async (prompt: string): Promise<string> => {
  // Check API Key selection for Veo models
  const win = window as any;
  if (win.aistudio && win.aistudio.hasSelectedApiKey) {
      const hasKey = await win.aistudio.hasSelectedApiKey();
      if (!hasKey) {
          if (win.aistudio.openSelectKey) {
              await win.aistudio.openSelectKey();
              // Proceed after dialog interaction (naive handling)
          } else {
             throw new Error("请先选择付费项目的 API Key 以使用 Veo 视频生成功能。");
          }
      }
  }

  // Use a fresh client to pick up the new key if selected
  const ai = getAiClient();
  const model = 'veo-3.1-fast-generate-preview';

  let operation = await ai.models.generateVideos({
    model,
    prompt,
    config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
    }
  });

  // Polling for video completion
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  if (operation.error) {
      throw new Error(operation.error.message || "生成视频失败");
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("未返回视频链接");

  // Return the URI with the API key appended for direct access
  return `${videoUri}&key=${process.env.API_KEY}`;
};
