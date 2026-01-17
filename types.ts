
export enum AppView {
  DASHBOARD = 'DASHBOARD',
  TOPIC_RESEARCH = 'TOPIC_RESEARCH',
  SCRIPT_WRITER = 'SCRIPT_WRITER',
  CONTENT_AUDIT = 'CONTENT_AUDIT',
  BENCHMARK_STUDIO = 'BENCHMARK_STUDIO',
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
  durationSeconds: number | string; // Allow custom input string initially
  avoidance?: string; // New: Negative constraints
  referenceLinks?: string[]; // New: Context links
}

// Deprecated single result type
export interface AuditResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  viralPotential: 'Low' | 'Medium' | 'High' | 'Very High';
}

export interface GeneratedMedia {
  type: 'image' | 'video';
  url: string; // Blob URL (image) or Remote URI (video)
  prompt: string;
  mimeType: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  isThinking?: boolean;
  generatedMedia?: GeneratedMedia; // New field for generated assets
}

export interface FileData {
  id: string;
  file: File;
  previewUrl: string;
  base64?: string;
  mimeType?: string;
  uploadStatus: 'pending' | 'uploading' | 'success' | 'error';
  uploadProgress: number;
}

export interface GroundingMetadata {
  groundingChunks?: Array<{
    web?: {
      uri: string;
      title: string;
    }
  }>
}
