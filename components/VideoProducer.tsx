
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2pdf from 'html2pdf.js';
import { createVideoProductionSession, sendScriptMessage, generateImage, generateVideo } from '../services/geminiService';
import { ChatMessage, FileData, GeneratedMedia } from '../types';
import { Chat, GenerateContentResponse } from "@google/genai";
import { PromptPicker } from './PromptLibrary';

interface VideoProducerProps {
  initialScript?: string;
}

const VideoProducer: React.FC<VideoProducerProps> = ({ initialScript = '' }) => {
  const [scriptContext, setScriptContext] = useState(initialScript);
  const [files, setFiles] = useState<FileData[]>([]); // Media Context Files (Top Panel)
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Script file upload state
  const [scriptFile, setScriptFile] = useState<FileData | null>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);

  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  
  // Chat attachment state
  const [chatFiles, setChatFiles] = useState<FileData[]>([]);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tool Modal State
  const [activeTool, setActiveTool] = useState<'image' | 'video' | null>(null);
  const [toolPrompt, setToolPrompt] = useState('');
  const [isToolGenerating, setIsToolGenerating] = useState(false);

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    // Auto-scroll chat when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, chatFiles]);

  // Initializing session
  useEffect(() => {
    const initSession = async () => {
      // Gather all context files: media files + script file if present
      const payloadFiles = files.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));
      if (scriptFile && scriptFile.base64 && scriptFile.mimeType) {
          payloadFiles.push({ data: scriptFile.base64, mimeType: scriptFile.mimeType });
      }

      const chat = await createVideoProductionSession(scriptContext, payloadFiles);
      setChatSession(chat);
      setMessages([{
        id: 'init',
        role: 'model',
        content: initialScript || scriptFile
          ? `🎬 视频制作室已就绪！\n我已读取您的素材箱内容。您可以点击上方的【快捷工具】来开始工作，比如：\n\n- **绘制分镜**：为脚本的关键画面生成参考图。\n- **制作视频**：生成具体的视频片段。\n- **生成文案**：优化口播台词。`
          : `🎬 欢迎来到视频制作室！\n请在上方上传您的脚本（支持 PDF/文本）或输入内容，我将协助您进行分镜绘制、视频生成和后期策划。`,
        timestamp: Date.now()
      }]);
    };
    initSession();
  }, []); // Run once on mount

  // --- Handlers ---
  const processFiles = (fileList: FileList): Promise<FileData[]> => {
      return Promise.all(Array.from(fileList).map(file => new Promise<FileData>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
              resolve({
                  id: Math.random().toString(36),
                  file,
                  previewUrl: URL.createObjectURL(file),
                  base64: (reader.result as string).split(',')[1],
                  mimeType: file.type || 'application/octet-stream',
                  uploadStatus: 'success', 
                  uploadProgress: 100
              });
          };
          reader.readAsDataURL(file);
      })));
  };

  // Sync uploaded assets to chat context immediately
  const syncAssetToChat = async (filesToSync: FileData[], messageType: 'script' | 'media') => {
      if (!chatSession) return;
      
      const payloads = filesToSync.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));
      const msg = messageType === 'script' 
          ? `[系统同步] 用户更新了脚本文件：${filesToSync[0].file.name}`
          : `[系统同步] 用户添加了 ${filesToSync.length} 个参考素材到素材箱`;
      
      // Send to Gemini to update context
      await sendScriptMessage(chatSession, msg, payloads);

      // Optional: Add a small system notice in UI (or keep it silent but logically synced)
      // keeping it silent to avoid clutter, or a small toast. 
      // Let's add a small system note to messages to reassure user.
      setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          content: `✅ 已同步${messageType === 'script' ? '脚本' : '视觉'}素材到当前上下文。`,
          timestamp: Date.now()
      }]);
  };

  // Context Panel Media Files
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const processed = await processFiles(e.target.files);
          setFiles(prev => [...prev, ...processed]);
          await syncAssetToChat(processed, 'media');
      }
      e.target.value = '';
  };

  // Context Panel Script File
  const handleScriptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const processed = await processFiles(e.target.files);
          setScriptFile(processed[0]);
          await syncAssetToChat(processed, 'script');
      }
      e.target.value = '';
  };

  // Chat Attachment Files
  const handleChatFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const processed = await processFiles(e.target.files);
          setChatFiles(prev => [...prev, ...processed]);
      }
      e.target.value = '';
  };

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    const filesToSend = chatFiles;
    
    if ((!textToSend.trim() && filesToSend.length === 0) || !chatSession) return;
    
    setInput('');
    setChatFiles([]);

    setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'user', 
        content: textToSend + (filesToSend.length > 0 ? `\n[已上传 ${filesToSend.length} 个附件]` : ''), 
        timestamp: Date.now() 
    }]);
    setLoading(true);

    try {
        const payloadFiles = filesToSend.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));
        const stream = await sendScriptMessage(chatSession, textToSend, payloadFiles);
        const msgId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, { id: msgId, role: 'model', content: '', timestamp: Date.now() }]);
        
        let fullText = "";
        for await (const chunk of stream) {
            const c = chunk as GenerateContentResponse;
            fullText += (c.text || "");
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  const triggerFeature = (feature: 'storyboard' | 'video_segment' | 'copywriting' | 'sound') => {
      let prompt = "";
      switch (feature) {
          case 'storyboard':
              setActiveTool('image');
              setToolPrompt("基于素材箱中的脚本，绘制第一幕的高清分镜图，画面描述：...");
              return;
          case 'video_segment':
              setActiveTool('video');
              setToolPrompt("基于当前脚本，生成一段视频展现...");
              return;
          case 'copywriting':
              prompt = "请帮我优化素材箱中脚本的配音文案，使其更具感染力，并标注重音和停顿。";
              break;
          case 'sound':
              prompt = "请根据当前脚本内容，列出详细的音效(SFX)和背景音乐(BGM)建议清单。";
              break;
      }
      if (prompt) handleSendMessage(prompt);
  };

  const handleToolGenerate = async () => {
      if (!activeTool || !toolPrompt.trim()) return;
      setIsToolGenerating(true);
      setActiveTool(null); 

      const tempId = Date.now().toString();
      setMessages(prev => [...prev, {
          id: tempId,
          role: 'model',
          content: `🎨 正在生成${activeTool === 'image' ? '分镜图' : '视频片段'}，请稍候... \n> ${toolPrompt}`,
          timestamp: Date.now(),
          isThinking: true
      }]);

      try {
          let mediaData: GeneratedMedia;
          if (activeTool === 'image') {
              const res = await generateImage(toolPrompt);
              mediaData = { type: 'image', url: `data:${res.mimeType};base64,${res.base64}`, mimeType: res.mimeType, prompt: toolPrompt };
          } else {
              const uri = await generateVideo(toolPrompt);
              mediaData = { type: 'video', url: uri, mimeType: 'video/mp4', prompt: toolPrompt };
          }

          setMessages(prev => prev.map(m => m.id === tempId ? {
              ...m,
              content: `✅ 生成完成！`,
              isThinking: false,
              generatedMedia: mediaData
          } : m));
      } catch (e: any) {
          setMessages(prev => prev.map(m => m.id === tempId ? {
              ...m,
              content: `❌ 生成失败: ${e.message}`,
              isThinking: false
          } : m));
      } finally {
          setIsToolGenerating(false);
      }
  };

  // --- Action Handlers ---
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadMarkdown = (content: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ViralFlow_Chat_${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generatePDF = async (messageId: string, content: string) => {
    if (downloadingId) return;
    setDownloadingId(messageId);
    
    // Create temp container
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.color = 'black';
    container.style.background = 'white';
    
    // Render markdown to HTML for PDF (Simplified approach)
    // Ideally we clone the DOM node, but for stability we can re-render or use innerHTML of the displayed bubble
    const sourceElement = document.getElementById(`msg-content-${messageId}`);
    if (sourceElement) {
        container.innerHTML = sourceElement.innerHTML;
    } else {
        container.innerText = content;
    }
    
    document.body.appendChild(container);

    try {
        // @ts-ignore
        await html2pdf().set({
             margin: 10,
             filename: `ViralFlow_Output_${Date.now()}.pdf`,
             image: { type: 'jpeg', quality: 0.98 },
             html2canvas: { scale: 2 },
             jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(container).save();
    } catch(e) { console.error(e) } 
    finally {
        document.body.removeChild(container);
        setDownloadingId(null);
    }
  };

  const renderChatAttachments = () => {
      if (chatFiles.length === 0) return null;
      return (
          <div className="flex gap-2 mb-2 overflow-x-auto px-4 pb-2">
              {chatFiles.map((f, i) => (
                  <div key={i} className="relative w-16 h-16 shrink-0 bg-dark-900 rounded-lg border border-dark-600 overflow-hidden group">
                       {f.mimeType?.startsWith('image') ? <img src={f.previewUrl} className="w-full h-full object-cover"/> : <div className="text-[10px] p-1 flex items-center justify-center h-full text-center text-gray-400 break-all">{f.file.name}</div>}
                       <button onClick={() => setChatFiles(prev => prev.filter(x => x.id !== f.id))} className="absolute top-0 right-0 bg-red-500 w-4 h-4 flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100">×</button>
                  </div>
              ))}
          </div>
      );
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in pb-8 h-full">
        
        {/* Top Section Grid (More Compact) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 shrink-0">
            
            {/* 1. Script & Material Box */}
            <div className="xl:col-span-2 flex flex-col gap-2">
                <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 flex flex-col shadow-xl min-h-[350px]">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                            📄 制作素材箱 <span className="text-[10px] font-normal text-gray-500 bg-dark-800 px-2 rounded">已同步至对话</span>
                        </h3>
                        <div className="flex gap-2">
                             <input type="file" ref={scriptFileInputRef} onChange={handleScriptFileChange} className="hidden" accept=".pdf,.doc,.docx,.txt,.md" />
                             <button 
                                 onClick={() => scriptFileInputRef.current?.click()}
                                 className="text-xs bg-dark-800 hover:bg-dark-700 px-3 py-1.5 rounded-lg border border-dark-600 text-gray-300 transition-colors flex items-center gap-1"
                             >
                                 {scriptFile ? '📄 替换文档' : '📂 上传剧本(PDF/Word)'}
                             </button>
                        </div>
                    </div>
                    
                    {/* Script Editor */}
                    <div className="flex-1 flex flex-col relative bg-dark-950 rounded-xl border border-dark-700 overflow-hidden mb-2">
                        {scriptFile && (
                             <div className="bg-brand-900/20 px-3 py-1.5 border-b border-brand-500/10 flex items-center justify-between">
                                 <span className="text-xs text-brand-300 flex items-center gap-1 truncate">
                                    <span>📎</span> 已加载: {scriptFile.file.name}
                                 </span>
                                 <button onClick={() => setScriptFile(null)} className="text-gray-500 hover:text-white text-xs shrink-0 ml-2">移除</button>
                             </div>
                        )}
                        <textarea 
                            value={scriptContext}
                            onChange={(e) => setScriptContext(e.target.value)}
                            className="flex-1 w-full bg-transparent p-3 text-sm text-gray-200 resize-none focus:outline-none custom-scrollbar leading-relaxed placeholder-gray-600 font-mono"
                            placeholder="在此输入分镜头脚本，或者直接粘贴大纲..."
                        />
                    </div>

                    {/* Reference Media Row */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                             <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">视觉参考素材</label>
                             <button 
                                 onClick={() => fileInputRef.current?.click()}
                                 className="text-xs text-brand-400 hover:text-brand-300"
                             >
                                 + 添加素材
                             </button>
                             <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar h-16">
                            {files.length === 0 && (
                                <div onClick={() => fileInputRef.current?.click()} className="w-16 h-16 shrink-0 border border-dashed border-dark-700 rounded-lg flex items-center justify-center text-gray-600 hover:border-dark-500 hover:text-gray-400 cursor-pointer transition-colors text-xs">
                                    +素材
                                </div>
                            )}
                            {files.map((f, i) => (
                                <div key={i} className="relative w-16 h-16 shrink-0 bg-dark-800 rounded-lg border border-dark-700 overflow-hidden group shadow-sm">
                                    {f.mimeType?.startsWith('image') ? <img src={f.previewUrl} className="w-full h-full object-cover"/> : <div className="text-[9px] p-1 text-center text-gray-500 flex items-center justify-center h-full break-all">{f.file.name}</div>}
                                    <button onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))} className="absolute top-0 right-0 bg-black/60 text-white w-4 h-4 flex items-center justify-center text-[10px] rounded-bl opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-all">×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Quick Tools Box (Compact Grid) */}
            <div className="xl:col-span-1 bg-dark-900 border border-dark-800 rounded-2xl p-4 shadow-xl flex flex-col h-[350px]">
                <h3 className="text-base font-bold text-white mb-3">⚡ 创作工具箱</h3>
                <div className="grid grid-cols-2 gap-3 flex-1 overflow-y-auto custom-scrollbar content-start">
                    <button 
                        onClick={() => triggerFeature('storyboard')} 
                        className="bg-dark-800 hover:bg-dark-700 border border-dark-700 p-3 rounded-xl flex flex-col items-center gap-2 transition-all group shadow-sm text-center"
                    >
                        <div className="text-2xl group-hover:scale-110 transition-transform">🎨</div>
                        <div>
                            <div className="font-bold text-gray-200 text-xs group-hover:text-brand-300">绘制分镜</div>
                            <div className="text-[9px] text-gray-500 mt-0.5">Imagen 3</div>
                        </div>
                    </button>
                    
                    <button 
                        onClick={() => triggerFeature('video_segment')} 
                        className="bg-dark-800 hover:bg-dark-700 border border-dark-700 p-3 rounded-xl flex flex-col items-center gap-2 transition-all group shadow-sm text-center"
                    >
                        <div className="text-2xl group-hover:scale-110 transition-transform">🎥</div>
                        <div>
                            <div className="font-bold text-gray-200 text-xs group-hover:text-brand-300">制作视频</div>
                            <div className="text-[9px] text-gray-500 mt-0.5">Veo Model</div>
                        </div>
                    </button>

                    <button 
                        onClick={() => triggerFeature('copywriting')} 
                        className="bg-dark-800 hover:bg-dark-700 border border-dark-700 p-3 rounded-xl flex flex-col items-center gap-2 transition-all group shadow-sm text-center"
                    >
                        <div className="text-2xl group-hover:scale-110 transition-transform">✍️</div>
                        <div>
                            <div className="font-bold text-gray-200 text-xs group-hover:text-brand-300">文案润色</div>
                            <div className="text-[9px] text-gray-500 mt-0.5">优化台词</div>
                        </div>
                    </button>

                    <button 
                        onClick={() => triggerFeature('sound')} 
                        className="bg-dark-800 hover:bg-dark-700 border border-dark-700 p-3 rounded-xl flex flex-col items-center gap-2 transition-all group shadow-sm text-center"
                    >
                        <div className="text-2xl group-hover:scale-110 transition-transform">🎵</div>
                        <div>
                            <div className="font-bold text-gray-200 text-xs group-hover:text-brand-300">音效建议</div>
                            <div className="text-[9px] text-gray-500 mt-0.5">BGM & SFX</div>
                        </div>
                    </button>
                </div>
            </div>
        </div>

        {/* Bottom Section: Chat Interface (Flexible) */}
        <div className="flex-1 min-h-[500px] bg-dark-900 rounded-2xl border border-dark-800 flex flex-col overflow-hidden shadow-2xl relative">
            <div className="bg-dark-800/80 backdrop-blur px-4 py-3 border-b border-dark-700 flex justify-between items-center shrink-0 z-10">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse"></span>
                    <span className="font-bold text-white text-sm">AI 制作助理</span>
                </div>
                <div className="text-[10px] text-gray-500 bg-dark-950/50 px-2 py-0.5 rounded border border-dark-700">
                    Gemini 1.5 Pro & Veo
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-dark-950/30 custom-scrollbar">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-4 shadow-lg ${
                            msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-dark-800 text-gray-100 rounded-bl-sm border border-dark-700'
                        }`}>
                            {msg.generatedMedia ? (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                         <p className="font-bold text-xs text-brand-300 flex items-center gap-2">
                                            {msg.generatedMedia.type === 'image' ? '🖼️ 分镜参考图' : '🎥 视频片段'}
                                         </p>
                                         <span className="text-[9px] bg-dark-900/50 px-2 py-0.5 rounded text-gray-400">Generated</span>
                                    </div>
                                    <div className="rounded-lg overflow-hidden border border-dark-600 bg-black/50 mb-2 shadow-lg group relative">
                                        {msg.generatedMedia.type === 'image' ? (
                                            <img src={msg.generatedMedia.url} className="w-full h-auto max-h-[300px] object-contain mx-auto" />
                                        ) : (
                                            <video src={msg.generatedMedia.url} controls className="w-full h-auto max-h-[300px] mx-auto" />
                                        )}
                                    </div>
                                    <div className="bg-dark-900/50 p-2 rounded border border-dark-700 mb-2">
                                       <p className="text-[10px] text-gray-400 italic mb-0.5">Prompt:</p>
                                       <p className="text-xs text-gray-300 line-clamp-2">{msg.generatedMedia.prompt}</p>
                                    </div>
                                    <a href={msg.generatedMedia.url} download={`asset_${Date.now()}.${msg.generatedMedia.mimeType.split('/')[1]}`} className="text-xs bg-dark-700 hover:bg-white hover:text-black px-3 py-1.5 rounded inline-block border border-dark-600 transition-all font-bold">⬇️ 下载素材</a>
                                </div>
                            ) : (
                                <div id={`msg-content-${msg.id}`} className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-li:marker:text-brand-500">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                </div>
                            )}
                        </div>
                        
                        {/* Chat Actions Toolbar (Only for model text messages) */}
                        {msg.role === 'model' && !msg.generatedMedia && !msg.isThinking && (
                            <div className="flex gap-2 mt-1 ml-1 opacity-60 hover:opacity-100 transition-opacity">
                                <button onClick={() => handleCopy(msg.content)} className="text-[10px] bg-dark-800 hover:bg-dark-700 border border-dark-700 hover:border-gray-500 px-2 py-0.5 rounded text-gray-400 hover:text-white transition-colors flex items-center gap-1">
                                    📋 复制
                                </button>
                                <button onClick={() => downloadMarkdown(msg.content)} className="text-[10px] bg-dark-800 hover:bg-dark-700 border border-dark-700 hover:border-gray-500 px-2 py-0.5 rounded text-gray-400 hover:text-white transition-colors flex items-center gap-1">
                                    ⬇️ MD
                                </button>
                                <button onClick={() => generatePDF(msg.id, msg.content)} disabled={downloadingId === msg.id} className="text-[10px] bg-dark-800 hover:bg-dark-700 border border-dark-700 hover:border-gray-500 px-2 py-0.5 rounded text-gray-400 hover:text-white transition-colors flex items-center gap-1">
                                    {downloadingId === msg.id ? '⏳' : '📄'} PDF
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {loading && (
                    <div className="flex items-center gap-3 text-gray-500 ml-4">
                        <div className="flex gap-1">
                             <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"></span>
                             <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce delay-75"></span>
                             <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce delay-150"></span>
                        </div>
                        <span className="text-xs">AI 正在思考...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="bg-dark-800 border-t border-dark-700 shrink-0 p-3">
                {renderChatAttachments()}
                <div className="flex gap-2 items-end">
                    <button 
                       onClick={() => chatFileInputRef.current?.click()}
                       className="w-10 h-10 rounded-xl bg-dark-900 border border-dark-600 text-gray-400 hover:text-white hover:border-brand-500 flex items-center justify-center transition-all shrink-0 shadow-sm"
                       title="上传图片/文件"
                    >
                       <span className="text-lg">📎</span>
                       <input type="file" multiple ref={chatFileInputRef} onChange={handleChatFileChange} className="hidden" />
                    </button>
                    
                    <div className="flex-1 flex flex-col gap-1 relative">
                         <div className="absolute bottom-full mb-2 left-0">
                            <PromptPicker onSelect={setInput} currentValue={input} position="top" />
                         </div>
                         <input 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            className="w-full bg-dark-950 border border-dark-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500 text-sm shadow-inner"
                            placeholder="输入指令，例如：生成一段赛博朋克风格的视频..."
                            disabled={loading}
                        />
                    </div>
                    <button onClick={() => handleSendMessage()} disabled={(!input.trim() && chatFiles.length === 0) || loading} className="h-10 bg-brand-600 px-6 rounded-xl font-bold text-white text-sm disabled:opacity-50 hover:bg-brand-500 transition-all shadow-lg hover:shadow-brand-500/20 shrink-0">发送</button>
                </div>
            </div>

            {/* Generation Tool Modal */}
            {activeTool && (
                <div className="absolute inset-x-0 bottom-0 bg-dark-800/95 backdrop-blur border-t-2 border-brand-500 p-6 shadow-2xl animate-slide-up z-20">
                    <div className="max-w-3xl mx-auto">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-base font-bold text-white flex items-center gap-2">
                                {activeTool === 'image' ? '🎨 生成分镜/参考图 (Imagen 3)' : '🎥 生成视频片段 (Veo)'}
                            </h4>
                            <button onClick={() => setActiveTool(null)} className="text-gray-400 hover:text-white text-xl">&times;</button>
                        </div>
                        <textarea 
                            value={toolPrompt}
                            onChange={(e) => setToolPrompt(e.target.value)}
                            className="w-full bg-dark-950 border border-dark-600 rounded-xl p-3 text-white h-24 mb-3 focus:border-brand-500 resize-none text-sm shadow-inner"
                            placeholder={activeTool === 'image' ? "描述画面内容、构图、光影..." : "描述视频动作、运镜、氛围..."}
                        />
                        <div className="flex justify-end">
                             <button 
                                onClick={handleToolGenerate}
                                disabled={!toolPrompt.trim() || isToolGenerating}
                                className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-xl font-bold text-sm disabled:opacity-50 shadow-lg hover:shadow-brand-500/20 transition-all"
                             >
                                 {isToolGenerating ? '生成中...' : '立即生成'}
                             </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default VideoProducer;
