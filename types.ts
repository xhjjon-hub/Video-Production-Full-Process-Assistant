export enum AppView {
  DASHBOARD = 'DASHBOARD',
  TOPIC_RESEARCH = 'TOPIC_RESEARCH',
  SCRIPT_WRITER = 'SCRIPT_WRITER',
  CONTENT_AUDIT = 'CONTENT_AUDIT',
}

export enum Platform {
  TIKTOK = 'TikTok',
  DOUYIN = 'Douyin',
  YOUTUBE_SHORTS = 'YouTube Shorts',
  INSTAGRAM_REELS = 'Instagram Reels',
  RED_NOTE = 'Xiaohongshu'
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
}

export interface GroundingMetadata {
  groundingChunks?: Array<{
    web?: {
      uri: string;
      title: string;
    }
  }>
}