
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createAuditSession, sendAuditMessage, chatWithAssistant } from '../services/geminiService';
import { ChatMessage, FileData, AuditTone } from '../types';
import { Chat, GenerateContentResponse } from "@google/genai";
import html2pdf from 'html2pdf.js';
import { PromptPicker } from './PromptLibrary';

const STORAGE_KEY_MESSAGES = 'viralflow_audit_messages';
const STORAGE_KEY_PHASE = 'viralflow_audit_phase';

const MediaAnalyzer: React.FC = () => {
  // Phase: 'upload' | 'consultation'
  const [phase, setPhase] = useState<'upload' | 'consultation'>('upload');
  
  // Upload State - Two buckets
  const [userFiles, setUserFiles] = useState<FileData[]>([]);
  const [benchmarkFiles, setBenchmarkFiles] = useState<FileData[]>([]);
  const [selectedTone, setSelectedTone] = useState<AuditTone>(AuditTone.CRITICAL);
  
  const [context, setContext] = useState('');
  
  // Refs for hidden inputs
  const userFileInputRef = useRef<HTMLInputElement>(null);
  const benchmarkFileInputRef = useRef<HTMLInputElement>(null);

  // Chat/Consultation State
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // Analysis Progress State (0-100)
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Persistence Logic ---
  useEffect(() => {
    // Load history on mount
    const savedMessages = localStorage.getItem(STORAGE_KEY_MESSAGES);
    const savedPhase = localStorage.getItem(STORAGE_KEY_PHASE);

    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          // If we have messages, we are likely in consultation phase or should be
          if (savedPhase === 'consultation') {
            setPhase('consultation');
          }
        }
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  useEffect(() => {
    // Save history on change
    if (messages.length > 0) {
        localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    }
    localStorage.setItem(STORAGE_KEY_PHASE, phase);
  }, [messages, phase]);

  const clearHistory = () => {
    if (window.confirm("确定要清除所有历史记录并开始新的诊断吗？")) {
      setMessages([]);
      setUserFiles([]);
      setBenchmarkFiles([]);
      setPhase('upload');
      setChatSession(null);
      localStorage.removeItem(STORAGE_KEY_MESSAGES);
      localStorage.removeItem(STORAGE_KEY_PHASE);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, phase]);

  // --- File Handling ---

  const processFileList = (files: FileList): FileData[] => {
      const newFiles: FileData[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
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
      return newFiles;
  };

  const readFileContent = (fileData: FileData, setFileState: React.Dispatch<React.SetStateAction<FileData[]>>) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        setFileState(prev => prev.map(f => f.id === fileData.id ? { ...f, uploadStatus: 'uploading', uploadProgress: progress } : f));
      }
    };
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      let mimeType = fileData.file.type;
      if (fileData.file.name.endsWith('.pdf')) mimeType = 'application/pdf';

      setFileState(prev => prev.map(f => {
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
        setFileState(prev => prev.map(f => f.id === fileData.id ? { ...f, uploadStatus: 'error' } : f));
    };
    reader.readAsDataURL(fileData.file);
  };

  const handleUserFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = processFileList(e.target.files);
      setUserFiles(prev => [...prev, ...newFiles]);
      newFiles.forEach(f => readFileContent(f, setUserFiles));
    }
    if (userFileInputRef.current) userFileInputRef.current.value = '';
  };

  const handleBenchmarkFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = processFileList(e.target.files);
      setBenchmarkFiles(prev => [...prev, ...newFiles]);
      newFiles.forEach(f => readFileContent(f, setBenchmarkFiles));
    }
    if (benchmarkFileInputRef.current) benchmarkFileInputRef.current.value = '';
  };

  const removeUserFile = (id: string) => setUserFiles(prev => prev.filter(f => f.id !== id));
  const removeBenchmarkFile = (id: string) => setBenchmarkFiles(prev => prev.filter(f => f.id !== id));

  const renderFilePreview = (fileData: FileData, onRemove: (id: string) => void) => {
    const { file, previewUrl, uploadStatus, uploadProgress } = fileData;
    let content;
    if (file.type.startsWith('image')) {
      content = <img src={previewUrl} className="w-full h-full object-cover rounded-lg opacity-80" alt="preview" />;
    } else if (file.type.startsWith('video')) {
      content = <video src={previewUrl} className="w-full h-full object-cover rounded-lg opacity-80" />;
    } else {
      let icon = '📄';
      if (file.type.includes('pdf')) icon = '📑';
      if (file.type.includes('audio')) icon = '🎵';

      content = (
        <div className="w-full h-full flex flex-col items-center justify-center bg-dark-700 text-gray-300 rounded-lg p-2">
          <span className="text-3xl mb-1">{icon}</span>
          <span className="text-xs truncate w-full text-center">{file.name}</span>
        </div>
      );
    }

    return (
      <div className="relative w-full aspect-square group bg-dark-800 rounded-lg border border-dark-700">
        {content}
        <button onClick={(e) => { e.stopPropagation(); onRemove(fileData.id); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-20 text-xs">✕</button>
        {uploadStatus === 'uploading' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-lg p-2 z-10">
            <div className="w-full bg-gray-700 h-1 rounded-full overflow-hidden mb-1">
              <div className="bg-brand-500 h-full" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- Audit Logic ---

  const startAudit = async () => {
    const pendingUser = userFiles.some(f => f.uploadStatus !== 'success');
    const pendingBench = benchmarkFiles.some(f => f.uploadStatus !== 'success');
    
    if (pendingUser || pendingBench) {
      alert("请等待所有文件上传完成后再开始分析。");
      return;
    }
    if (userFiles.length === 0) {
        alert("请至少上传一个你的作品");
        return;
    }

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
      const userPayloads = userFiles.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));
      const benchPayloads = benchmarkFiles.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));

      const { chat, initialResponseStream } = await createAuditSession(userPayloads, benchPayloads, context, selectedTone);
      
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
    if (!input.trim()) return;
    const userText = input;
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userText, timestamp: Date.now() }]);
    setIsTyping(true);

    try {
      let stream;
      if (chatSession) {
        stream = await sendAuditMessage(chatSession, userText);
      } else {
        const history = messages.map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        }));
        stream = await chatWithAssistant(history, userText);
      }

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
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: "**发送失败**: 连接已断开。", timestamp: Date.now() }]);
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
        link.download = `Audit_Report_${Date.now()}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
        console.error("Download failed", e);
    }
  };
  
  const generatePDF = async (messageId: string, content: string) => {
    if (downloadingId) return; 
    setDownloadingId(messageId);
    
    const element = document.getElementById(`msg-content-${messageId}`);
    if(!element) { setDownloadingId(null); return; }
    
    // Create temp container
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.color = 'black';
    container.style.background = 'white';
    container.innerHTML = element.innerHTML;
    document.body.appendChild(container);

    try {
        // @ts-ignore
        await html2pdf().set({
             margin: 10,
             filename: `Audit_Report_${Date.now()}.pdf`,
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

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  // --- Render ---

  if (phase === 'upload') {
    return (
      <div className="max-w-6xl mx-auto space-y-8 pb-12 animate-fade-in">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">AI 内容诊断室</h2>
          <p className="text-gray-400 mt-2">支持单/多视频上传，无论是否有对标视频，AI 都能为您深度分析。</p>
          {messages.length > 0 && (
             <div className="mt-4">
                <button onClick={() => setPhase('consultation')} className="text-sm text-brand-400 hover:text-brand-300 underline">恢复上次会话</button>
             </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: User Content */}
            <div className="bg-dark-900 rounded-2xl border border-dark-800 p-6 flex flex-col shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>📝</span> 我的作品 (待批改)
                    </h3>
                    <span className="text-xs bg-dark-800 px-2 py-1 rounded text-gray-400">支持批量</span>
                </div>
                
                <div 
                    onClick={() => userFileInputRef.current?.click()}
                    className="flex-1 border-2 border-dashed border-dark-700 hover:border-brand-500 hover:bg-dark-800/30 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all min-h-[150px] mb-4"
                >
                    <input type="file" multiple ref={userFileInputRef} onChange={handleUserFilesChange} className="hidden" accept="video/*,image/*" />
                    <span className="text-3xl mb-2">📂</span>
                    <p className="text-sm text-gray-400">点击上传一个或多个视频</p>
                </div>

                <div className="grid grid-cols-4 gap-2 min-h-[80px]">
                    {userFiles.map(f => <div key={f.id}>{renderFilePreview(f, removeUserFile)}</div>)}
                </div>
            </div>

            {/* Right: Benchmark Content */}
            <div className="bg-dark-900 rounded-2xl border border-dashed border-yellow-600/30 p-6 flex flex-col shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-yellow-600/20 text-yellow-500 text-[10px] px-2 py-1 rounded-bl-lg font-bold border-l border-b border-yellow-600/30">
                    高分模版区
                </div>
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-yellow-500 flex items-center gap-2">
                        <span>⭐</span> 对标视频 (可选)
                    </h3>
                    <span className="text-xs bg-dark-800 px-2 py-1 rounded text-gray-400">选填</span>
                </div>
                
                <div 
                    onClick={() => benchmarkFileInputRef.current?.click()}
                    className="flex-1 border-2 border-dashed border-dark-700 hover:border-yellow-500 hover:bg-yellow-900/10 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all min-h-[150px] mb-4"
                >
                    <input type="file" multiple ref={benchmarkFileInputRef} onChange={handleBenchmarkFilesChange} className="hidden" accept="video/*" />
                    <span className="text-3xl mb-2 text-yellow-600">🏆</span>
                    <p className="text-sm text-gray-400">上传你想模仿的爆款视频</p>
                    <p className="text-xs text-gray-600 mt-1">若不上传，AI将按通用标准评价</p>
                </div>

                <div className="grid grid-cols-4 gap-2 min-h-[80px]">
                    {benchmarkFiles.map(f => <div key={f.id}>{renderFilePreview(f, removeBenchmarkFile)}</div>)}
                </div>
            </div>
        </div>

        <div className="bg-dark-900 rounded-2xl border border-dark-800 p-6 shadow-xl space-y-6">
            {/* Tone Selection */}
            <div>
               <label className="block text-sm font-medium text-gray-400 mb-3">选择 AI 评价风格</label>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                 {Object.values(AuditTone).map((tone) => (
                   <button
                     key={tone}
                     onClick={() => setSelectedTone(tone)}
                     className={`py-3 px-4 rounded-xl border transition-all text-sm font-medium relative overflow-hidden group ${
                       selectedTone === tone
                         ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20'
                         : 'bg-dark-950 border-dark-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                     }`}
                   >
                     {selectedTone === tone && (
                        <div className="absolute top-0 right-0 w-3 h-3 bg-white/20 rounded-bl-lg"></div>
                     )}
                     {tone}
                   </button>
                 ))}
               </div>
            </div>

            <div>
               <div className="flex justify-between items-center mb-1">
                 <label className="block text-sm font-medium text-gray-400">补充背景</label>
                 <PromptPicker onSelect={setContext} currentValue={context} />
               </div>
               <textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="例如：我的账号定位是..." className="w-full bg-dark-950 border border-dark-700 rounded-lg p-4 text-white focus:ring-2 focus:ring-brand-500 h-20 resize-none" />
            </div>

            <button
              onClick={startAudit}
              disabled={userFiles.length === 0 || analysisProgress > 0}
              className={`w-full text-white font-bold py-4 rounded-xl shadow-lg transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-gradient-to-r ${
                  selectedTone === AuditTone.CRITICAL ? 'from-red-600 to-orange-600 hover:shadow-red-500/20' :
                  selectedTone === AuditTone.ENCOURAGING ? 'from-green-600 to-teal-600 hover:shadow-green-500/20' :
                  selectedTone === AuditTone.ANALYTICAL ? 'from-blue-600 to-indigo-600 hover:shadow-blue-500/20' :
                  'from-brand-600 to-purple-600 hover:shadow-brand-500/20'
              }`}
            >
              {analysisProgress > 0 ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  {benchmarkFiles.length > 0 ? '正在进行对比分析...' : '正在深度诊断...'}
                </>
              ) : (
                benchmarkFiles.length > 0 ? '🚀 开始对比分析' : '🔍 开始深度诊断'
              )}
            </button>
            
            {analysisProgress > 0 && (
              <div className="w-full bg-dark-800 rounded-lg p-4 border border-dark-700 mt-4 animate-fade-in">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-300">AI 正在逐帧分析...</span>
                  <span className="text-xs font-bold text-white">{Math.floor(analysisProgress)}%</span>
                </div>
                <div className="w-full bg-dark-950 rounded-full h-2.5 overflow-hidden">
                   <div className={`h-2.5 rounded-full transition-all duration-300 ease-out bg-gradient-to-r ${
                      selectedTone === AuditTone.CRITICAL ? 'from-red-600 to-orange-500' :
                      selectedTone === AuditTone.ENCOURAGING ? 'from-green-600 to-teal-500' :
                      'from-brand-600 to-purple-500'
                   }`} style={{ width: `${analysisProgress}%` }}></div>
                </div>
              </div>
            )}
        </div>
      </div>
    );
  }

  // Phase: Consultation (Chat Interface)
  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-140px)] flex flex-col bg-dark-900 rounded-2xl border border-dark-800 overflow-hidden shadow-2xl animate-fade-in relative">
      
      {/* Header */}
      <div className="bg-dark-800 p-4 border-b border-dark-700 flex justify-between items-center z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setPhase('upload')} className="text-gray-400 hover:text-white transition-colors">← 上传页</button>
          <div className="h-6 w-px bg-dark-600"></div>
          <span className="font-semibold text-white">AI 诊断报告</span>
          {benchmarkFiles.length > 0 && <span className="text-xs bg-yellow-900/30 text-yellow-500 px-2 py-0.5 rounded border border-yellow-700/50 ml-2">对比模式</span>}
          <span className="text-xs bg-dark-700 text-gray-300 px-2 py-0.5 rounded border border-dark-600">{selectedTone.split(' ')[0]}</span>
        </div>
        <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded hover:bg-red-900/20 transition-colors">
          清除会话
        </button>
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
               {/* Show Role Badge for Model */}
               {msg.role === 'model' && (
                   <div className="mb-2 flex items-center gap-2">
                       <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                           selectedTone === AuditTone.CRITICAL ? 'bg-red-900/40 text-red-400 border-red-800/30' :
                           selectedTone === AuditTone.ENCOURAGING ? 'bg-green-900/40 text-green-400 border-green-800/30' :
                           'bg-brand-900/40 text-brand-300 border-brand-800/30'
                       }`}>
                          {selectedTone.split(' ')[0]}
                       </span>
                   </div>
               )}
               <div id={`msg-content-${msg.id}`} className="prose prose-invert prose-base max-w-none prose-brand leading-relaxed">
                 <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                        table: ({node, ...props}) => <div className="overflow-x-auto my-4 border border-dark-700 rounded-lg"><table className="min-w-full divide-y divide-dark-700" {...props} /></div>,
                        th: ({node, ...props}) => <th className="px-3 py-2 bg-dark-900 text-left text-xs font-medium text-gray-300 uppercase tracking-wider border-r border-dark-700 last:border-r-0" {...props} />,
                        td: ({node, ...props}) => <td className="px-3 py-2 whitespace-normal text-sm text-gray-200 border-r border-dark-700 last:border-r-0 border-t border-dark-700" {...props} />
                    }}
                 >
                    {msg.content}
                 </ReactMarkdown>
               </div>
             </div>
             
             {/* Actions */}
             <div className={`flex items-center gap-3 mt-2 px-1 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
               <span className="text-xs text-gray-500">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
               {msg.role === 'model' && !isTyping && msg.content && (
                 <div className="flex gap-2">
                   <button onClick={() => copyToClipboard(msg.content)} className="text-xs text-gray-400 hover:text-brand-300 px-2 py-1 rounded hover:bg-dark-800">复制</button>
                   <button onClick={() => downloadMarkdown(msg.content)} className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-blue-900/20 border border-blue-900/50">MD</button>
                   <button onClick={() => generatePDF(msg.id, msg.content)} disabled={downloadingId === msg.id} className="text-xs text-brand-400 hover:text-brand-300 px-2 py-1 rounded bg-brand-900/20 border border-brand-900/50">
                     {downloadingId === msg.id ? '生成中...' : 'PDF'}
                   </button>
                 </div>
               )}
             </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-dark-800 rounded-3xl rounded-bl-none px-6 py-5 border border-dark-700 flex items-center gap-2">
              <span className="text-sm text-gray-400">正在分析...</span>
              <div className="flex gap-1.5"><div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce delay-150"></div></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-6 bg-dark-800 border-t border-dark-700 shrink-0 z-20">
        <div className="flex gap-3 max-w-4xl mx-auto items-center">
          <PromptPicker onSelect={setInput} currentValue={input} position="top" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="进一步询问细节..."
            disabled={isTyping}
            className="flex-1 bg-dark-950 border border-dark-600 rounded-2xl px-6 py-4 text-base text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          />
          <button onClick={handleSendMessage} disabled={!input.trim() || isTyping} className="bg-brand-600 hover:bg-brand-500 text-white rounded-2xl px-8 font-semibold shadow-lg disabled:opacity-50">发送</button>
        </div>
      </div>
    </div>
  );
};

export default MediaAnalyzer;
