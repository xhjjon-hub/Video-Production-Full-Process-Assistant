import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { createAuditSession, sendAuditMessage, generateFinalPlan } from '../services/geminiService';
import { ChatMessage, FileData } from '../types';
import { Chat, GenerateContentResponse } from "@google/genai";

const MediaAnalyzer: React.FC = () => {
  // Phase: 'upload' | 'consultation'
  const [phase, setPhase] = useState<'upload' | 'consultation'>('upload');
  
  // Upload State
  const [files, setFiles] = useState<FileData[]>([]);
  const [context, setContext] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat/Consultation State
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  // Analysis Progress State (0-100)
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // --- File Handling with Progress ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles: FileData[] = [];
      
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        if (file.size > 20 * 1024 * 1024) {
          alert(`文件 ${file.name} 太大，请上传小于 20MB 的文件`);
          continue;
        }

        const id = Math.random().toString(36).substring(7);
        newFiles.push({
          id,
          file,
          previewUrl: URL.createObjectURL(file),
          uploadStatus: 'pending',
          uploadProgress: 0
        });
      }

      setFiles(prev => [...prev, ...newFiles]);

      // Trigger processing for new files
      newFiles.forEach(processFile);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = (fileData: FileData) => {
    // Update status to uploading
    updateFileStatus(fileData.id, 'uploading', 0);

    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        updateFileStatus(fileData.id, 'uploading', progress);
      }
    };

    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      
      // Normalize mime type
      let mimeType = fileData.file.type;
      if (fileData.file.name.endsWith('.pdf')) mimeType = 'application/pdf';

      setFiles(prev => prev.map(f => {
        if (f.id === fileData.id) {
          return {
            ...f,
            base64: base64String,
            mimeType: mimeType,
            uploadStatus: 'success',
            uploadProgress: 100
          };
        }
        return f;
      }));
    };

    reader.onerror = () => {
      updateFileStatus(fileData.id, 'error', 0);
    };

    reader.readAsDataURL(fileData.file);
  };

  const updateFileStatus = (id: string, status: FileData['uploadStatus'], progress: number) => {
    setFiles(prev => prev.map(f => 
      f.id === id ? { ...f, uploadStatus: status, uploadProgress: progress } : f
    ));
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const renderFilePreview = (fileData: FileData) => {
    const { file, previewUrl, uploadStatus, uploadProgress } = fileData;
    
    let content;
    if (file.type.startsWith('image')) {
      content = <img src={previewUrl} className="w-full h-full object-cover rounded-lg opacity-80" alt="preview" />;
    } else if (file.type.startsWith('video')) {
      content = <video src={previewUrl} className="w-full h-full object-cover rounded-lg opacity-80" />;
    } else {
      // Icons for docs
      let icon = '📄';
      if (file.type.includes('pdf')) icon = '📑';
      if (file.type.includes('presentation') || file.type.includes('powerpoint')) icon = '📊';
      if (file.type.includes('audio')) icon = '🎵';

      content = (
        <div className="w-full h-full flex flex-col items-center justify-center bg-dark-700 text-gray-300 rounded-lg p-2">
          <span className="text-3xl mb-1">{icon}</span>
          <span className="text-xs truncate w-full text-center">{file.name}</span>
        </div>
      );
    }

    return (
      <div className="relative w-full h-full group">
        {content}
        
        {/* Progress Overlay */}
        {uploadStatus === 'uploading' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-lg p-2 z-10">
            <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden mb-2">
              <div 
                className="bg-brand-500 h-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <span className="text-xs text-white font-medium">{uploadProgress}%</span>
          </div>
        )}

        {/* Status Indicators */}
        {uploadStatus === 'success' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-green-500/10 border-2 border-green-500/50">
            <div className="bg-green-500 rounded-full w-8 h-8 flex items-center justify-center shadow-lg mb-2">
               <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <span className="text-[10px] font-bold text-green-400 bg-black/50 px-2 py-0.5 rounded-full">
              上传完成
            </span>
          </div>
        )}

        {uploadStatus === 'error' && (
           <div className="absolute inset-0 bg-red-500/20 flex flex-col items-center justify-center rounded-lg border-2 border-red-500/50">
             <div className="bg-red-500 rounded-full w-8 h-8 flex items-center justify-center shadow-lg mb-2">
                <span className="text-white font-bold text-lg">✕</span>
             </div>
             <span className="text-[10px] text-red-200 bg-red-900/80 px-2 py-0.5 rounded">上传失败</span>
           </div>
        )}
      </div>
    );
  };

  // --- Audit Logic ---

  const startAudit = async () => {
    // Only allow starting if all files are uploaded successfully
    const pending = files.some(f => f.uploadStatus !== 'success');
    if (pending) {
      alert("请等待所有文件上传完成后再开始分析。");
      return;
    }
    if (files.length === 0) return;

    // DO NOT switch phase yet. Stay on upload screen to show progress.
    setIsTyping(true);
    setAnalysisProgress(1); // Start progress bar

    // Simulate progress bar for better UX
    const progressInterval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 95) return prev; // Stop at ~95% until real response comes
        // Non-linear progress: slows down as it gets higher
        const increment = prev < 50 ? Math.random() * 8 + 2 : Math.random() * 2 + 1;
        return Math.min(prev + increment, 95);
      });
    }, 200);

    try {
      // Prepare payload
      const filePayloads = files.map(f => ({
        data: f.base64!,
        mimeType: f.mimeType!
      }));

      // Start Chat Session (This might take a few seconds)
      const { chat, initialResponseStream } = await createAuditSession(filePayloads, context);
      
      // Connection Established
      clearInterval(progressInterval);
      setAnalysisProgress(100); 

      // NOW we switch to the chat view
      setChatSession(chat);
      setPhase('consultation');

      // Add initial AI message placeholder
      const msgId = Date.now().toString();
      setMessages([{
        id: msgId,
        role: 'model',
        content: '',
        timestamp: Date.now()
      }]);

      // Stream response
      let fullText = "";
      for await (const chunk of initialResponseStream) {
        const c = chunk as GenerateContentResponse;
        fullText += (c.text || "");
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
      }

    } catch (e) {
      console.error(e);
      clearInterval(progressInterval);
      setAnalysisProgress(0); // Reset progress
      alert("初始化诊断失败，请检查 API Key 或网络。");
      // Stay on upload page
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !chatSession) return;

    const userText = input;
    setInput('');
    
    // Optimistic UI update
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      timestamp: Date.now()
    }]);
    
    setIsTyping(true);

    try {
      const stream = await sendAuditMessage(chatSession, userText);
      
      const msgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: msgId,
        role: 'model',
        content: '',
        timestamp: Date.now()
      }]);

      let fullText = "";
      for await (const chunk of stream) {
        const c = chunk as GenerateContentResponse;
        fullText += (c.text || "");
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        content: "**发送失败**: 请稍后重试。",
        timestamp: Date.now()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleExportPlan = async () => {
    if (!chatSession) return;
    setIsTyping(true);
    
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'model',
      content: "📝 正在为您生成最终执行方案，请稍候...",
      timestamp: Date.now()
    }]);

    try {
      const planText = await generateFinalPlan(chatSession);
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        content: "✅ 方案已生成并开始下载！",
        timestamp: Date.now()
      }]);

      const blob = new Blob([planText], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ViralFlow_Final_Plan_${new Date().toISOString().slice(0,10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (e) {
      console.error(e);
      alert("导出失败");
    } finally {
      setIsTyping(false);
    }
  };

  // --- Render ---

  if (phase === 'upload') {
    return (
      <div className="max-w-5xl mx-auto space-y-8 pb-12 animate-fade-in">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">多模态内容诊断室</h2>
          <p className="text-gray-400">批量上传，AI 综合分析，对话式打磨优化</p>
        </div>

        <div className="bg-dark-900 rounded-2xl border border-dark-800 p-8 shadow-2xl">
          {/* Upload Area */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-dark-600 hover:border-brand-500 hover:bg-dark-800/50 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all mb-8 min-h-[200px]"
          >
            <input 
              type="file" 
              multiple
              ref={fileInputRef}
              onChange={handleFileChange} 
              accept="image/*,video/*,audio/*,text/plain,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden" 
            />
            <span className="text-5xl mb-4">📂</span>
            <p className="text-xl font-medium text-white">点击添加文件 (支持批量)</p>
            <p className="text-sm text-gray-500 mt-2">支持 视频 / 图片 / 音频 / PDF / PPT</p>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
              {files.map((f, i) => (
                <div key={f.id} className="relative aspect-square bg-dark-800 rounded-lg border border-dark-700 hover:border-gray-500 transition-colors">
                  {renderFilePreview(f)}
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-20"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Context Input */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-400 mb-2">补充创作背景 (可选)</label>
            <textarea 
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="例如：这是一组系列视频，我想知道风格是否统一，以及哪一个更适合做先导片..."
              className="w-full bg-dark-950 border border-dark-700 rounded-lg p-4 text-white focus:ring-2 focus:ring-brand-500 h-24 resize-none"
            />
          </div>

          <div className="space-y-4">
            <button
              onClick={startAudit}
              disabled={files.length === 0 || files.some(f => f.uploadStatus !== 'success') || analysisProgress > 0}
              className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-brand-500/20 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {analysisProgress > 0 ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  正在建立分析会话...
                </>
              ) : (
                files.length === 0 ? '请先上传文件' : 
                files.some(f => f.uploadStatus === 'uploading') ? '文件上传中...' :
                files.some(f => f.uploadStatus === 'error') ? '存在上传失败的文件' :
                `开始分析 ${files.length} 个文件 🚀`
              )}
            </button>

            {/* Analysis Progress Bar - Immediately visible below button */}
            {analysisProgress > 0 && (
              <div className="w-full bg-dark-800 rounded-lg p-4 border border-dark-700 animate-fade-in">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-brand-300">
                    AI 正在读取并分析素材内容...
                  </span>
                  <span className="text-xs font-bold text-white">
                    {Math.floor(analysisProgress)}%
                  </span>
                </div>
                <div className="w-full bg-dark-950 rounded-full h-2.5 overflow-hidden">
                   <div 
                     className="bg-gradient-to-r from-brand-600 to-purple-500 h-2.5 rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(216,70,239,0.5)]" 
                     style={{ width: `${analysisProgress}%` }}
                   ></div>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  正在上传 {files.length} 个文件至 Gemini 3.0 Pro 视觉模型...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Phase: Consultation (Chat Interface)
  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-140px)] flex flex-col bg-dark-900 rounded-2xl border border-dark-800 overflow-hidden shadow-2xl animate-fade-in relative">
      
      {/* Header */}
      <div className="bg-dark-800 p-4 border-b border-dark-700 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setPhase('upload')} className="text-gray-400 hover:text-white transition-colors">
            ← 返回上传
          </button>
          <div className="h-6 w-px bg-dark-600"></div>
          <div className="flex flex-col">
            <span className="font-semibold text-white">AI 诊断会话</span>
          </div>
          <span className="text-xs bg-brand-900 text-brand-300 px-2 py-0.5 rounded-full border border-brand-800 ml-2">
            {files.length} 个文件
          </span>
        </div>
        <button 
          onClick={handleExportPlan}
          disabled={isTyping}
          className="bg-brand-600 hover:bg-brand-500 text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <span>💾</span> 生成并导出方案
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-dark-950/50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
             <div className={`max-w-[90%] md:max-w-[80%] rounded-2xl px-5 py-4 ${
               msg.role === 'user' 
                 ? 'bg-brand-600 text-white rounded-br-sm' 
                 : 'bg-dark-800 text-gray-200 rounded-bl-sm border border-dark-700 shadow-sm'
             }`}>
               <div className="prose prose-invert prose-sm max-w-none prose-brand">
                 <ReactMarkdown>{msg.content}</ReactMarkdown>
               </div>
               <div className="mt-2 text-xs opacity-40 text-right">
                 {new Date(msg.timestamp).toLocaleTimeString()}
               </div>
             </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-dark-800 rounded-2xl rounded-bl-sm px-5 py-4 border border-dark-700 flex items-center gap-2">
              <span className="text-sm text-gray-400">AI 正在思考...</span>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce delay-75"></div>
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce delay-150"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-dark-800 border-t border-dark-700">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="对方案不满意？询问如何改进具体的细节..."
            disabled={isTyping}
            className="flex-1 bg-dark-950 border border-dark-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          />
          <button 
            onClick={handleSendMessage}
            disabled={!input.trim() || isTyping}
            className="bg-brand-600 hover:bg-brand-500 text-white rounded-xl px-6 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaAnalyzer;