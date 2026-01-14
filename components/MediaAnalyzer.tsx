import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { createAuditSession, sendAuditMessage, generateFinalPlan } from '../services/geminiService';
import { ChatMessage, FileData } from '../types';
import { Chat, GenerateContentResponse } from "@google/genai";
import html2pdf from 'html2pdf.js';

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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
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
      newFiles.forEach(processFile);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = (fileData: FileData) => {
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
        {uploadStatus === 'uploading' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-lg p-2 z-10">
            <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden mb-2">
              <div className="bg-brand-500 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
            </div>
            <span className="text-xs text-white font-medium">{uploadProgress}%</span>
          </div>
        )}
        {uploadStatus === 'success' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-green-500/10 border-2 border-green-500/50">
            <div className="bg-green-500 rounded-full w-8 h-8 flex items-center justify-center shadow-lg mb-2">
               <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <span className="text-[10px] font-bold text-green-400 bg-black/50 px-2 py-0.5 rounded-full">上传完成</span>
          </div>
        )}
        {uploadStatus === 'error' && (
           <div className="absolute inset-0 bg-red-500/20 flex flex-col items-center justify-center rounded-lg border-2 border-red-500/50">
             <div className="bg-red-500 rounded-full w-8 h-8 flex items-center justify-center shadow-lg mb-2"><span className="text-white font-bold text-lg">✕</span></div>
             <span className="text-[10px] text-red-200 bg-red-900/80 px-2 py-0.5 rounded">上传失败</span>
           </div>
        )}
      </div>
    );
  };

  // --- Audit Logic ---

  const startAudit = async () => {
    const pending = files.some(f => f.uploadStatus !== 'success');
    if (pending) {
      alert("请等待所有文件上传完成后再开始分析。");
      return;
    }
    if (files.length === 0) return;

    setIsTyping(true);
    setAnalysisProgress(1);

    const progressInterval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 95) return prev;
        const increment = prev < 50 ? Math.random() * 8 + 2 : Math.random() * 2 + 1;
        return Math.min(prev + increment, 95);
      });
    }, 200);

    try {
      const filePayloads = files.map(f => ({
        data: f.base64!,
        mimeType: f.mimeType!
      }));

      const { chat, initialResponseStream } = await createAuditSession(filePayloads, context);
      
      clearInterval(progressInterval);
      setAnalysisProgress(100); 

      setChatSession(chat);
      setPhase('consultation');

      const msgId = Date.now().toString();
      setMessages([{
        id: msgId,
        role: 'model',
        content: '',
        timestamp: Date.now()
      }]);

      let fullText = "";
      for await (const chunk of initialResponseStream) {
        const c = chunk as GenerateContentResponse;
        fullText += (c.text || "");
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
      }

    } catch (e) {
      console.error(e);
      clearInterval(progressInterval);
      setAnalysisProgress(0);
      alert("初始化诊断失败，请检查 API Key 或网络。");
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !chatSession) return;
    const userText = input;
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userText, timestamp: Date.now() }]);
    setIsTyping(true);

    try {
      const stream = await sendAuditMessage(chatSession, userText);
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
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: "**发送失败**: 请稍后重试。", timestamp: Date.now() }]);
    } finally {
      setIsTyping(false);
    }
  };

  // --- Download Handlers ---

  const downloadMarkdown = (content: string) => {
    try {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ViralFlow_Audit_${Date.now()}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
        console.error("Markdown download failed", e);
        alert("下载失败");
    }
  };
  
  const generatePDF = async (messageId: string, content: string) => {
    if (downloadingId) return; 
    setDownloadingId(messageId);
    
    // 1. Locate source content from DOM
    // We access the specific message bubble content
    const sourceNode = document.getElementById(`msg-content-${messageId}`);
    if (!sourceNode) {
       setDownloadingId(null);
       alert("无法找到内容");
       return;
    }

    // 2. Create an isolated, fixed container for PDF generation
    // We position it fixed at 0,0 but behind everything (z-index -9999).
    // It must be visible to the DOM (not display:none) for html2canvas to render it.
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '210mm'; // Standard A4 width
    // container.style.minHeight = '297mm'; 
    container.style.zIndex = '-9999';
    container.style.backgroundColor = '#ffffff'; // Ensure white background
    container.style.color = '#000000'; // Ensure black text
    container.style.padding = '20mm';
    container.style.boxSizing = 'border-box';
    
    // 3. Clone the content to avoid modifying the actual UI
    const contentClone = sourceNode.cloneNode(true) as HTMLElement;

    // 4. CRITICAL: Strip ALL classes from the cloned tree.
    // The original content uses Tailwind classes like 'prose-invert' (white text) and 'bg-dark-xxx'.
    // By removing classes, we rely purely on the browser's default styles + our injected CSS below.
    const stripClasses = (node: HTMLElement) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            node.removeAttribute('class');
            // Also strip inline styles that might color text white
            node.style.color = ''; 
            node.style.background = '';
            // Recurse
            Array.from(node.children).forEach(child => stripClasses(child as HTMLElement));
        }
    }
    stripClasses(contentClone);

    // 5. Inject Print-Specific CSS into the container
    // This re-styles the naked HTML elements (h1, p, ul) to look good on PDF.
    const style = document.createElement('style');
    style.innerHTML = `
      .pdf-root { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333; }
      h1, h2, h3, h4, h5, h6 { color: #111; font-weight: bold; margin-top: 1.2em; margin-bottom: 0.5em; }
      h1 { font-size: 24px; border-bottom: 2px solid #d946ef; padding-bottom: 10px; margin-top: 0; }
      h2 { font-size: 18px; color: #a21caf; margin-top: 1.5em; }
      h3 { font-size: 16px; font-weight: bold; }
      p { margin-bottom: 0.8em; text-align: justify; }
      ul, ol { margin-bottom: 0.8em; padding-left: 1.5em; }
      li { margin-bottom: 0.3em; }
      strong, b { color: #000; font-weight: bold; }
      code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
      pre { background: #f3f4f6; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 0.85em; margin-bottom: 1em; }
      blockquote { border-left: 4px solid #e5e7eb; padding-left: 1em; color: #4b5563; font-style: italic; }
      img { max-width: 100%; height: auto; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
      th { background-color: #f9fafb; font-weight: 600; }
    `;
    container.appendChild(style);

    // Wrap content in a class for specificity if needed, though scoped by container is fine.
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-root';
    
    // Add Header
    const header = document.createElement('div');
    header.innerHTML = `
        <h1 style="color: #c026d3; font-size: 24px; margin-bottom: 5px;">ViralFlow 智能分析报告</h1>
        <p style="color: #6b7280; font-size: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 15px; margin-bottom: 25px;">
           生成日期: ${new Date().toLocaleString()}
        </p>
    `;
    wrapper.appendChild(header);
    
    // Add Body
    wrapper.appendChild(contentClone);

    // Add Footer
    const footer = document.createElement('div');
    footer.innerHTML = `
        <div style="margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 15px; text-align: center; color: #9ca3af; font-size: 10px;">
          Generated by Gemini 3.0 & ViralFlow Creator Studio
        </div>
    `;
    wrapper.appendChild(footer);

    container.appendChild(wrapper);
    document.body.appendChild(container);

    try {
        let worker: any = html2pdf;
        if (typeof worker !== 'function' && (worker as any).default) {
            worker = (worker as any).default;
        }

        const opt = {
          margin: 0, 
          filename: `ViralFlow_Audit_${Date.now()}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { 
            scale: 2, 
            useCORS: true, 
            logging: false,
            windowWidth: 1200, // Force desktop width
            scrollY: 0
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Delay to allow DOM layout
        await new Promise(resolve => setTimeout(resolve, 800));

        await worker().set(opt).from(container).save();

    } catch (e: any) {
        console.error("PDF Generation Error", e);
        alert("PDF 生成失败: " + e.message);
    } finally {
        if (document.body.contains(container)) {
            document.body.removeChild(container);
        }
        setDownloadingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast here
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
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-dark-600 hover:border-brand-500 hover:bg-dark-800/50 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all mb-8 min-h-[200px]"
          >
            <input 
              type="file" multiple ref={fileInputRef} onChange={handleFileChange} 
              accept="image/*,video/*,audio/*,text/plain,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden" 
            />
            <span className="text-5xl mb-4">📂</span>
            <p className="text-xl font-medium text-white">点击添加文件 (支持批量)</p>
            <p className="text-sm text-gray-500 mt-2">支持 视频 / 图片 / 音频 / PDF / PPT</p>
          </div>
          {files.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
              {files.map((f) => (
                <div key={f.id} className="relative aspect-square bg-dark-800 rounded-lg border border-dark-700 hover:border-gray-500 transition-colors">
                  {renderFilePreview(f)}
                  <button onClick={(e) => { e.stopPropagation(); removeFile(f.id); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-20">✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-400 mb-2">补充创作背景 (可选)</label>
            <textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="例如：这是一组系列视频，我想知道风格是否统一..." className="w-full bg-dark-950 border border-dark-700 rounded-lg p-4 text-white focus:ring-2 focus:ring-brand-500 h-24 resize-none" />
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
            {analysisProgress > 0 && (
              <div className="w-full bg-dark-800 rounded-lg p-4 border border-dark-700 animate-fade-in">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-brand-300">AI 正在读取并分析素材内容...</span>
                  <span className="text-xs font-bold text-white">{Math.floor(analysisProgress)}%</span>
                </div>
                <div className="w-full bg-dark-950 rounded-full h-2.5 overflow-hidden">
                   <div className="bg-gradient-to-r from-brand-600 to-purple-500 h-2.5 rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(216,70,239,0.5)]" style={{ width: `${analysisProgress}%` }}></div>
                </div>
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
      <div className="bg-dark-800 p-4 border-b border-dark-700 flex justify-between items-center z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setPhase('upload')} className="text-gray-400 hover:text-white transition-colors">← 返回上传</button>
          <div className="h-6 w-px bg-dark-600"></div>
          <span className="font-semibold text-white">AI 诊断会话</span>
          <span className="text-xs bg-brand-900 text-brand-300 px-2 py-0.5 rounded-full border border-brand-800 ml-2">{files.length} 个文件</span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-dark-950/50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in-up`}>
             <div className={`max-w-[95%] md:max-w-[85%] rounded-3xl p-6 shadow-md transition-all ${
               msg.role === 'user' 
                 ? 'bg-brand-600 text-white rounded-br-none' 
                 : 'bg-dark-800 text-gray-100 rounded-bl-none border border-dark-700'
             }`}>
               <div id={`msg-content-${msg.id}`} className="prose prose-invert prose-base max-w-none prose-brand leading-relaxed">
                 <ReactMarkdown>{msg.content}</ReactMarkdown>
               </div>
             </div>
             
             {/* Meta & Actions Row */}
             <div className={`flex items-center gap-3 mt-2 px-1 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
               <span className="text-xs text-gray-500">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
               
               {msg.role === 'model' && !isTyping && msg.content && (
                 <div className="flex gap-2">
                   <button 
                     onClick={() => copyToClipboard(msg.content)}
                     className="text-xs text-gray-400 hover:text-brand-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-dark-800 transition-colors"
                     title="复制内容"
                   >
                     <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                     复制
                   </button>
                   <button 
                     onClick={() => downloadMarkdown(msg.content)}
                     className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 px-2 py-1 rounded bg-blue-900/20 border border-blue-900/50 hover:bg-blue-900/40 transition-colors"
                     title="下载 Markdown 原文"
                   >
                     <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                     下载 MD
                   </button>
                   <button 
                     onClick={() => generatePDF(msg.id, msg.content)}
                     disabled={downloadingId === msg.id}
                     className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 px-2 py-1 rounded bg-brand-900/20 border border-brand-900/50 hover:bg-brand-900/40 transition-colors"
                     title="下载 PDF 报告"
                   >
                     {downloadingId === msg.id ? (
                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                     ) : (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                     )}
                     下载 PDF
                   </button>
                 </div>
               )}
             </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-dark-800 rounded-3xl rounded-bl-none px-6 py-5 border border-dark-700 flex items-center gap-2 shadow-sm">
              <span className="text-sm text-gray-400">AI 正在思考...</span>
              <div className="flex gap-1.5">
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
      <div className="p-6 bg-dark-800 border-t border-dark-700 shrink-0 z-20">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="对方案不满意？询问如何改进具体的细节..."
            disabled={isTyping}
            className="flex-1 bg-dark-950 border border-dark-600 rounded-2xl px-6 py-4 text-base text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-50 transition-all shadow-inner"
          />
          <button 
            onClick={handleSendMessage}
            disabled={!input.trim() || isTyping}
            className="bg-brand-600 hover:bg-brand-500 text-white rounded-2xl px-8 font-semibold transition-all shadow-lg hover:shadow-brand-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaAnalyzer;