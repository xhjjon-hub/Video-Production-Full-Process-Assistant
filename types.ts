export enum AppView {
  DASHBOARD = 'DASHBOARD',
  TOPIC_RESEARCH = 'TOPIC_RESEARCH',
  SCRIPT_WRITER = 'SCRIPT_WRITER',
  CONTENT_AUDIT = 'CONTENT_AUDIT',
}

export enum Platform {
  TIKTOK = 'TikTok',
  DOUYIN = '抖音',
  YOUTUBE_SHORTS = 'YouTube Shorts',
  INSTAGRAM_REELS = 'Instagram Reels',
  RED_NOTE = '小红书'
}

export interface TopicResult {
  title: string;
  description: string;
  relevanceScore: number;
  trendingReason: string;
  sources?: Array<{
    title: string;
    url: string;
  }>;
}

export interface ScriptParams {
  platform: Platform;
  topic: string;
  targetAudience: string;
  tone: string;
  durationSeconds: number;
}

// Deprecated single result type, keeping for compatibility if needed, 
// but we are moving to chat-based audit.
export interface AuditResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  viralPotential: 'Low' | 'Medium' | 'High' | 'Very High';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  isThinking?: boolean; // For UI loading state
}

export interface FileData {
  id: string; // Unique ID for tracking
  file: File;
  previewUrl: string;
  base64?: string;
  mimeType?: string;
  uploadStatus: 'pending' | 'uploading' | 'success' | 'error';
  uploadProgress: number; // 0-100
}

export interface GroundingMetadata {
  groundingChunks?: Array<{
    web?: {
      uri: string;
      title: string;
    }
  }>
}