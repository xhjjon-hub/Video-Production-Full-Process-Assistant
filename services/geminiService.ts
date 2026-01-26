
import { GoogleGenAI, Type, Chat } from "@google/genai";
import { Platform, ScriptParams, TopicResult, ChatMessage, FileData, AuditTone } from "../types";

// Helper to get client with current key
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

// 1. Topic Research with Search Grounding & Multimodal Inputs
export const researchTopics = async (
  query: string, 
  domain: string, 
  platform: Platform, 
  contextFiles: { data: string; mimeType: string }[] = [],
  contextLinks: string[] = [],
  benchmarkFiles: { data: string; mimeType: string }[] = [],
  benchmarkLinks: string[] = [],
  batchIndex: number = 0
): Promise<TopicResult[]> => {
  const ai = getAiClient();
  
  const parts: any[] = [];

  // 1. Add Benchmark Files (Style Targets)
  if (benchmarkFiles.length > 0) {
    parts.push({ text: "【⭐ 对标风格参考 (Benchmark Style)】\n请分析以下文件的视觉风格、剪辑节奏和叙事结构，生成的选题需要适合用这种形式表现：" });
    benchmarkFiles.forEach(f => {
      parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
    });
  }

  // 2. Add Context Files (Content Source)
  if (contextFiles.length > 0) {
    parts.push({ text: "\n【📚 内容参考资料 (Context Source)】\n请从以下文件中提取核心知识点、事实或灵感，作为选题的内容基础：" });
    contextFiles.forEach(f => {
      parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
    });
  }

  // 3. Construct the prompt
  let promptText = `
    你是一位短视频爆款内容策略专家。
    任务：基于用户的请求，为 **${platform}** 平台策划 5 个爆款选题。
    
    【用户输入】
    - 核心方向/查询: "${query}"
    - 领域/赛道: "${domain}"
    ${contextLinks.length > 0 ? `- 内容参考链接: ${contextLinks.join(', ')} (请搜索并阅读内容)` : ''}
    ${benchmarkLinks.length > 0 ? `- 对标风格链接: ${benchmarkLinks.join(', ')} (请搜索并分析其风格)` : ''}

    【策略要求】
    1. **平台强相关**: 选题必须符合 **${platform}** 的用户偏好。
    2. **融合策略**: 
       - 如果提供了【内容参考资料】，选题必须基于其中的信息进行延展或深挖。
       - 如果提供了【对标风格参考】，选题的呈现形式（如“口播”、“Vlog”、“卡点剪辑”等）必须模仿对标视频。
       - 如果两者都有，请将“参考资料的内容”装进“对标视频的壳子”里。
    3. **多样性**: 这是第 ${batchIndex + 1} 批次结果，请尝试不同角度。
    
    请严格以 JSON 数组格式返回结果，**所有文本内容必须使用中文**。
  `;

  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
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
            trendingReason: { type: Type.STRING, description: "Why is this trending or why it fits the benchmark/context?" }
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
    results.forEach((res, idx) => {
        const start = (idx * 2) % sources.length;
        const topicSources = sources.slice(start, start + 2);
        if (topicSources.length > 0) res.sources = topicSources;
    });
  }

  return results;
};

// 1.5 Topic Refinement Chat (New)
export const createTopicChatSession = (topic: TopicResult, platform: string): Chat => {
  const ai = getAiClient();
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    history: [
      {
        role: 'user',
        parts: [{ text: `我们正在讨论选题：“${topic.title}”。\n简介：${topic.description}\n平台：${platform}。\n请协助我完善这个创意。` }]
      },
      {
        role: 'model',
        parts: [{ text: `好的，这个选题非常有潜力！我们可以从切入角度、标题优化、或者具体的画面设计来进一步讨论。你想从哪里开始？` }]
      }
    ],
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: "你是一位短视频创意策划顾问。用户选定了一个特定的选题，你需要通过对话帮助用户打磨这个选题，使其更具爆款潜质。你可以提供标题建议、开头Hook设计、或者内容结构的优化建议。请保持专业、富有创意且互动性强。",
    }
  });
};

// 2. Script Generation (Conversational)
export const createScriptWriterSession = async (params: ScriptParams, files: FileData[] = []): Promise<{ chat: Chat; initialResponseStream: any }> => {
  const ai = getAiClient();

  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview', // Use Pro for creative writing
    config: {
      systemInstruction: "你是一位金牌短视频编剧和导演。你的任务是为用户创作高质量、高完播率的短视频脚本。在后续对话中，用户可能会要求修改脚本的某个部分（如优化开头、调整语气、缩短时长等），请根据指令灵活调整。请始终使用 Markdown 格式输出，包含分镜、台词、画面描述等要素。",
      tools: [{ googleSearch: {} }], // Enable search for checking links
    }
  });

  // Construct Initial Prompt
  let promptText = `
    请为 ${params.platform} 平台创作一个爆款短视频脚本。

    【基本信息】
    - 主题: ${params.topic}
    - 目标受众: ${params.targetAudience}
    - 基调/风格: ${params.tone}
    - 目标时长: ${params.durationSeconds} 秒 (请严格控制字数和节奏以符合此时长)
  `;

  if (params.referenceLinks && params.referenceLinks.length > 0) {
    promptText += `\n\n【参考链接/NotebookLM 资料】(请结合以下链接内容作为背景知识或风格参考):\n${params.referenceLinks.join('\n')}`;
  }

  if (files.length > 0) {
    promptText += `\n\n【参考附件】\n我上传了 ${files.length} 个文件（文档、音频或视频）。请务必深入阅读/观看这些素材，提取其中的核心知识点、金句或风格，并将其融入到脚本创作中。`;
  }

  if (params.avoidance) {
    promptText += `\n\n【⛔ 避坑指南/禁忌事项】\n请绝对避免以下内容或方向：\n${params.avoidance}`;
  }

  promptText += `
    \n【输出要求】
    请**使用中文**并在 Markdown 格式中包含以下部分：
    1. **标题方案**: 提供 3 个高点击率的标题备选。
    2. **黄金前 3 秒 (Hook)**: 极其重要的开头，包含画面描述和第一句台词，目的是阻止划走。
    3. **脚本正文**: 分镜头描述（景别、运镜）、台词（逐字稿）、动作/表情。
    4. **CTA (行动号召)**: 自然地引导关注或互动。
    5. **BGM & 音效建议**: 具体到情绪或风格。
    
    请在脚本最后，简要说明你是如何利用我提供的“参考资料”或“避坑指南”进行创作的。
  `;

  // Build Parts
  const parts: any[] = [];
  
  // Add Files
  files.forEach(f => {
    if (f.base64 && f.mimeType) {
      parts.push({
        inlineData: {
          mimeType: f.mimeType,
          data: f.base64
        }
      });
    }
  });

  // Add Text
  parts.push({ text: promptText });

  const initialResponseStream = await chat.sendMessageStream({
    message: parts
  });

  return { chat, initialResponseStream };
};

// Deprecated single-shot function, kept for compatibility if needed, but not used in new flow
export const generateVideoScript = async (params: ScriptParams, files: FileData[] = []): Promise<string> => {
  const { initialResponseStream } = await createScriptWriterSession(params, files);
  let text = "";
  for await (const chunk of initialResponseStream) {
      text += (chunk as any).text || "";
  }
  return text;
};

export const sendScriptMessage = async (chat: Chat, message: string) => {
    return await chat.sendMessageStream({ message });
};

// 3. Multi-File Interactive Audit Session (Updated for Tone Selection and History Comparison)
export const createAuditSession = async (
  userAssets: { data: string; mimeType: string }[],
  benchmarkAssets: { data: string; mimeType: string }[],
  historyAssets: { data: string; mimeType: string }[], // New: Previous versions
  context: string,
  tone: AuditTone
): Promise<{ chat: Chat; initialResponseStream: any }> => {
  const ai = getAiClient();

  // Define System Instructions based on Tone
  let systemInstruction = "";

  switch (tone) {
    case AuditTone.CRITICAL:
      systemInstruction = `
        你是一位极其严格、眼光毒辣的顶级电影导演和短视频算法专家。你的任务是对用户上传的视频进行残酷但真实的诊断。
        【核心原则】
        1. **拒绝客套**：不要使用“做的不错但可以更好”之类的废话。如果开头很烂，直接说“前3秒就会流失90%的用户”。
        2. **客观犀利**：你的评价必须建立在视听语言、算法逻辑和用户心理学基础上，不要顾及用户的面子，真实的批评才是最大的帮助。
        3. **结果导向**：所有的建议必须是为了提高完播率、互动率和涨粉率。
      `;
      break;
    case AuditTone.ENCOURAGING:
      systemInstruction = `
        你是一位温柔、循循善诱的创作导师。你的任务是发现用户视频中的闪光点，并温和地提出改进建议。
        【核心原则】
        1. **赞赏优先**：先找出视频中做得好的地方，给予肯定，建立用户的自信心。
        2. **温和建议**：用“如果这样调整会更好”代替“你这里做错了”。
        3. **激发潜能**：鼓励用户继续创作，强调每一次尝试都是进步。
      `;
      break;
    case AuditTone.ANALYTICAL:
      systemInstruction = `
        你是一位影视学院的教授和数据分析师。你的任务是对视频进行深度的结构化拆解和学术分析。
        【核心原则】
        1. **理论支撑**：运用视听语言理论、叙事结构模型（如英雄之旅）进行分析。
        2. **数据思维**：预估完播率曲线，分析用户流失点。
        3. **结构化输出**：评价必须逻辑严密，分类清晰。
      `;
      break;
    case AuditTone.OBJECTIVE:
    default:
      systemInstruction = `
        你是一位客观、公正的第三方审核员。你的任务是基于行业标准对视频进行无偏见的评估。
        【核心原则】
        1. **实事求是**：只陈述观察到的事实，不带有强烈的情感色彩。
        2. **标准统一**：依据画面质量、声音清晰度、内容完整性等通用标准进行评价。
        3. **平衡视角**：同时指出优点和缺点，比例适中。
      `;
      break;
  }

  // Common instruction for benchmark comparison if present
  systemInstruction += `
    \n如果用户提供了“对标视频（Benchmark）”，请将其视为标准答案，将用户的视频与之逐帧对比，找出差距。
    \n如果用户提供了“历史版本（Previous Versions）”，请进行迭代对比，评估修改效果。
    请始终使用中文回答，使用 Markdown 格式。
  `;

  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview', 
    config: {
      systemInstruction: systemInstruction,
    },
  });

  const parts: any[] = [];
  
  // 1. Add History Assets (Previous Versions)
  if (historyAssets && historyAssets.length > 0) {
    parts.push({ text: "【📜 历史版本 (Previous Versions)】\n以下是我之前修改前的版本，请作为对比参考，判断我是否有所进步：" });
    historyAssets.forEach(f => {
      parts.push({
        inlineData: {
          mimeType: f.mimeType,
          data: f.data
        }
      });
    });
  }

  // 2. Add Benchmark Assets (if any)
  if (benchmarkAssets.length > 0) {
    parts.push({ text: "\n【⭐ 满分对标/参考素材 (Benchmark Assets)】\n以下文件是行业内的优秀案例或我想模仿的对象，请以此为标准：" });
    benchmarkAssets.forEach(f => {
      parts.push({
        inlineData: {
          mimeType: f.mimeType,
          data: f.data
        }
      });
    });
  }

  // 3. Add User Assets (Current Version)
  parts.push({ text: "\n【📝 当前最新待诊断版本 (Current Version)】\n以下是我修改后的最新视频，请重点诊断此版本：" });
  userAssets.forEach(f => {
    parts.push({
      inlineData: {
        mimeType: f.mimeType,
        data: f.data
      }
    });
  });

  // 4. Add the prompt
  const hasBenchmarks = benchmarkAssets.length > 0;
  const hasHistory = historyAssets && historyAssets.length > 0;
  
  let initialPrompt = `
    背景/目标：${context || "暂无特殊背景，请以打造爆款为目标"}。
    当前评价模式：${tone}。请务必保持这个语调和人设。
  `;

  if (hasHistory) {
    initialPrompt += `
    **请进行【迭代效果复盘】**：
    对比我的“历史版本”和“当前最新版本”。
    1. **修改效果评估**: 我之前的缺点改掉了吗？改动是更有利还是更糟糕了？
    2. **当前问题诊断**: 新版本还存在哪些致命问题？
    ${hasBenchmarks ? '3. **差距分析**: 相比于历史版本，现在离“对标视频”更近了吗？' : ''}
    `;
  } else if (hasBenchmarks) {
    initialPrompt += `
    **请进行【对标差距诊断】**：
    将我的视频与对标视频逐帧对比。
    1. **Hook (前3秒)**: 差距在哪里？
    2. **节奏与剪辑**: 哪里不如对标视频？
    3. **视觉/表现力**: 画面质感、运镜对比。
    `;
  } else {
    initialPrompt += `
    **请进行【深度诊断】**：
    请对这些素材进行综合评估。
    1. **亮点与槽点**。
    2. **完播率预估**。
    3. **改进建议**。
    `;
  }

  initialPrompt += `\n最后，请给出 3-5 条针对当前版本的具体修改建议（Next Steps）。`;
  parts.push({ text: initialPrompt });

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
