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
    You are a viral content strategist. 
    Find 5 trending or high-potential short video topics based on the user's request: "${query}" in the domain of "${domain}".
    Focus on what works best for ${platform}.
    
    If appropriate, use Google Search to find real-time trends, news, or recent viral hits.
    
    Return the result strictly as a JSON array.
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
    Create a viral short video script for ${params.platform}.
    Topic: ${params.topic}
    Target Audience: ${params.targetAudience}
    Tone: ${params.tone}
    Estimated Duration: ${params.durationSeconds} seconds.

    Structure the response in Markdown:
    - **Hook (0-3s)**: Visual/Audio hook to stop scrolling.
    - **Content Body**: The main value/story (split into scenes).
    - **CTA**: Call to action.
    - **Visual Cues**: Camera angles, text overlays.
    - **Audio Cues**: Music, sound effects.
    
    Explain the strategy behind the hook.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', // Stronger reasoning for creative writing
    contents: prompt,
  });

  return response.text || "Failed to generate script.";
};

// 3. Content Audit (Multimodal)
export const auditContent = async (
  fileBase64: string, 
  mimeType: string, 
  context: string
): Promise<AuditResult> => {
  const ai = getAiClient();

  const prompt = `
    Analyze this uploaded material (Video/Image/Audio/Text) for a short video.
    Context provided by user: "${context}".
    
    Critique it based on:
    1. Attention grabbing (Hook capability)
    2. Pacing and Clarity
    3. Visual/Audio Quality
    4. Viral Potential
    
    Provide a JSON response with:
    - score (1-100)
    - strengths (array of strings)
    - weaknesses (array of strings)
    - suggestions (array of actionable advice)
    - viralPotential (Low, Medium, High, Very High)
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
      systemInstruction: "You are a helpful expert assistant for a short video creation app. Keep answers concise, encouraging, and focused on video production, algorithms, and creativity.",
    }
  });

  const result = await chat.sendMessageStream({ message: newMessage });
  return result;
};
