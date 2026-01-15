import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2pdf from 'html2pdf.js';
import { analyzeBenchmarkContent, createImitationSession, sendAuditMessage, createBenchmarkChat, generateImage, generateVideo } from '../services/geminiService';
import { ChatMessage, FileData, GeneratedMedia } from '../types';
import { Chat, GenerateContentResponse } from "@google/genai";

const STORAGE_KEY_BENCHMARK = 'viralflow_benchmark_state';

const BenchmarkStudio: React.FC = () => {
  // Steps: 1=Input Benchmark, 2=Interactive Analysis, 3=Input User Content, 4=Imitation Guide (Chat)
  const [step, setStep] = useState(1);
  
  // Step 1: Benchmark Input
  const [refUrl, setRefUrl] = useState('');
  const [refFile, setRefFile] = useState<FileData | null>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  
  // Step 2: Interactive Analysis Chat
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(''); // Raw analysis text
  const [step2ChatSession, setStep2ChatSession] = useState<Chat | null>(null);
  const [step2Messages, setStep2Messages] = useState<ChatMessage[]>([]);
  const [step2Input, setStep2Input] = useState('');
  const [step2Files, setStep2Files] = useState<FileData[]>([]);
  const [step2Typing, setStep2Typing] = useState(false);
  const step2FileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: User Input
  const [userIdea, setUserIdea] = useState('');
  const [userFiles, setUserFiles] = useState<FileData[]>([]);
  const userFileInputRef = useRef<HTMLInputElement>(null);

  // Step 4: Chat Guide & Generation
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatFiles, setChatFiles] = useState<FileData[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  
  // Generation UI State
  const [showGenModal, setShowGenModal] = useState(false);
  const [genType, setGenType] = useState<'image' | 'video'>('image');
  const [genPrompt, setGenPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BENCHMARK);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.step) {
             setStep(parsed.step > 1 ? 1 : 1);
             setRefUrl(parsed.refUrl || '');
             setUserIdea(parsed.userIdea || '');
        }
      } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_BENCHMARK, JSON.stringify({
      step, refUrl, userIdea
    }));
  }, [step, refUrl, userIdea]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => scrollToBottom(), [messages, isTyping, step2Messages, step2Typing, isGenerating]);

  // --- Helpers ---
  const processFiles = (files: FileList): Promise<FileData[]> => {
      return Promise.all(Array.from(files).map(file => new Promise<FileData>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
              resolve({
                  id: Math.random().toString(36),
                  file,
                  previewUrl: URL.createObjectURL(file),
                  base64: (reader.result as string).split(',')[1],
                  mimeType: file.type,
                  uploadStatus: 'success', uploadProgress: 100
              });
          };
          reader.readAsDataURL(file);
      })));
  };

  // --- Handlers ---

  const handleRefFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setRefFile({
          id: 'ref', file, 
          previewUrl: URL.createObjectURL(file),
          base64: (reader.result as string).split(',')[1],
          mimeType: file.type,
          uploadStatus: 'success', uploadProgress: 100
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUserFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = await processFiles(e.target.files);
      setUserFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleChatFilesChange = async (e: React.ChangeEvent<HTMLInputElement>, setFileState: React.Dispatch<React.SetStateAction<FileData[]>>) => {
      if (e.target.files) {
          const newFiles = await processFiles(e.target.files);
          setFileState(prev => [...prev, ...newFiles]);
      }
      e.target.value = ''; 
  };

  const startAnalysis = async () => {
    if (!refUrl && !refFile) return alert("请至少提供链接或上传视频");
    setIsAnalyzing(true);
    try {
      const result = await analyzeBenchmarkContent(
        refUrl, 
        refFile ? { data: refFile.base64!, mimeType: refFile.mimeType! } : undefined
      );
      setAnalysisResult(result);
      const chat = createBenchmarkChat(result);
      setStep2ChatSession(chat);
      setStep2Messages([{
          id: 'init', role: 'model', content: result, timestamp: Date.now()
      }]);
      setStep(2);
    } catch (e) {
      console.error(e);
      alert("分析失败，请检查网络或 Key");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStep2Send = async () => {
      if ((!step2Input.trim() && step2Files.length === 0) || !step2ChatSession) return;
      const txt = step2Input;
      const filesToSend = [...step2Files];
      
      setStep2Input('');
      setStep2Files([]); 
      
      setStep2Messages(prev => [...prev, { 
          id: Date.now().toString(), 
          role: 'user', 
          content: txt + (filesToSend.length > 0 ? `\n[已上传 ${filesToSend.length} 个文件]` : ''), 
          timestamp: Date.now() 
      }]);
      setStep2Typing(true);

      try {
        const filePayload = filesToSend.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));
        const stream = await sendAuditMessage(step2ChatSession, txt, filePayload);
        const msgId = (Date.now() + 1).toString();
        setStep2Messages(prev => [...prev, { id: msgId, role: 'model', content: '', timestamp: Date.now() }]);

        let fullText = "";
        for await (const chunk of stream) {
            const c = chunk as GenerateContentResponse;
            fullText += (c.text || "");
            setStep2Messages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
        }
      } catch (e) { console.error(e); }
      finally { setStep2Typing(false); }
  };

  const startImitation = async () => {
    setIsAnalyzing(true);
    try {
      const assetsPayload = userFiles.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));
      const { chat, initialResponseStream } = await createImitationSession(
          analysisResult, 
          userIdea, 
          assetsPayload,
          step2Messages 
      );
      setChatSession(chat);
      setStep(4);
      const msgId = Date.now().toString();
      setMessages([{ id: msgId, role: 'model', content: '', timestamp: Date.now() }]);
      let fullText = "";
      for await (const chunk of initialResponseStream) {
        const c = chunk as GenerateContentResponse;
        fullText += (c.text || "");
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
      }
    } catch (e) {
      console.error(e);
      alert("生成指南失败");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendMessage = async () => {
    if ((!chatInput.trim() && chatFiles.length === 0) || !chatSession) return;
    const txt = chatInput;
    const filesToSend = [...chatFiles];
    setChatInput('');
    setChatFiles([]);

    setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'user', 
        content: txt + (filesToSend.length > 0 ? `\n[已上传 ${filesToSend.length} 个文件]` : ''), 
        timestamp: Date.now() 
    }]);
    setIsTyping(true);

    try {
      const filePayload = filesToSend.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));
      const stream = await sendAuditMessage(chatSession, txt, filePayload);
      const msgId = (Date.now()+1).toString();
      setMessages(prev => [...prev, { id: msgId, role: 'model', content: '', timestamp: Date.now() }]);
      
      let fullText = "";
      for await (const chunk of stream) {
        const c = chunk as GenerateContentResponse;
        fullText += (c.text || "");
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
      }
    } catch (e) { console.error(e); } 
    finally { setIsTyping(false); }
  };

  // --- Generation Logic ---

  const handleGenSubmit = async () => {
    if (!genPrompt.trim()) return;
    setIsGenerating(true);
    setShowGenModal(false);

    // Placeholder message
    const tempId = Date.now().toString();
    setMessages(prev => [...prev, {
        id: tempId,
        role: 'model',
        content: `🎨 正在调用 ${genType === 'image' ? 'Imagen' : 'Veo'} 模型生成${genType === 'image' ? '图片' : '视频'}，请稍候... \n> 提示词: ${genPrompt}`,
        timestamp: Date.now(),
        isThinking: true
    }]);

    try {
        let mediaData: GeneratedMedia;
        if (genType === 'image') {
            const res = await generateImage(genPrompt);
            mediaData = {
                type: 'image',
                url: `data:${res.mimeType};base64,${res.base64}`,
                mimeType: res.mimeType,
                prompt: genPrompt
            };
        } else {
            const uri = await generateVideo(genPrompt);
            mediaData = {
                type: 'video',
                url: uri,
                mimeType: 'video/mp4',
                prompt: genPrompt
            };
        }

        // Replace placeholder
        setMessages(prev => prev.map(m => m.id === tempId ? {
            ...m,
            content: `✅ ${genType === 'image' ? '图片' : '视频'}生成成功！\n> **提示词**: ${genPrompt}\n\n如果不满意，请在下方告诉我要如何修改。`,
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
        setIsGenerating(false);
    }
  };

  const downloadMedia = async (media: GeneratedMedia) => {
    try {
        const response = await fetch(media.url);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `generated_${Date.now()}.${media.type === 'image' ? 'png' : 'mp4'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Download failed", e);
        alert("下载失败");
    }
  };

  const resetAll = () => {
    if(confirm("确定要重新开始吗？")) {
      setStep(1);
      setRefUrl('');
      setRefFile(null);
      setAnalysisResult('');
      setUserIdea('');
      setUserFiles([]);
      setMessages([]);
      setStep2Messages([]);
      setStep2ChatSession(null);
      localStorage.removeItem(STORAGE_KEY_BENCHMARK);
    }
  };

  // --- PDF Download ---
  const generatePDF = async (messageId: string, content: string) => {
    if (downloadingId) return; 
    setDownloadingId(messageId);
    
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '210mm'; 
    container.style.zIndex = '-9999';
    container.style.backgroundColor = '#ffffff'; 
    container.style.color = '#000000'; 
    container.style.padding = '20mm';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-root';
    wrapper.innerHTML = `
        <style>
            .pdf-root { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333; }
            h1 { color: #c026d3; font-size: 24px; border-bottom: 2px solid #d946ef; padding-bottom: 10px; margin-bottom: 20px; }
            h2 { font-size: 18px; color: #a21caf; margin-top: 1.5em; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 1em; font-size: 10pt; }
            th, td { border: 1px solid #9ca3af; padding: 8px; text-align: left; }
            th { background-color: #f3f4f6; font-weight: bold; }
        </style>
        <h1>ViralFlow 创作指南</h1>
        <div class="content-body"></div>
    `;

    const sourceNode = document.getElementById(`msg-content-${messageId}`);
    if (sourceNode) {
        const contentClone = sourceNode.cloneNode(true) as HTMLElement;
        const stripClasses = (node: HTMLElement) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                node.removeAttribute('class');
                node.style.color = ''; 
                node.style.background = '';
                Array.from(node.children).forEach(child => stripClasses(child as HTMLElement));
            }
        };
        stripClasses(contentClone);
        wrapper.querySelector('.content-body')?.appendChild(contentClone);
    } else {
        wrapper.querySelector('.content-body')!.innerHTML = `<pre>${content}</pre>`;
    }
    container.appendChild(wrapper);
    document.body.appendChild(container);

    try {
        let worker: any = html2pdf;
        if (typeof worker !== 'function' && (worker as any).default) worker = (worker as any).default;
        await worker().set({
          margin: 0, 
          filename: `ViralFlow_Guide_${Date.now()}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(container).save();
    } catch (e) { console.error(e); } 
    finally {
        if (document.body.contains(container)) document.body.removeChild(container);
        setDownloadingId(null);
    }
  };

  // Helper UI for File Previews in Chat
  const renderChatFilePreviews = (files: FileData[], setFiles: React.Dispatch<React.SetStateAction<FileData[]>>) => {
      if (files.length === 0) return null;
      return (
          <div className="flex gap-2 mb-2 overflow-x-auto px-4">
              {files.map((f, i) => (
                  <div key={i} className="relative group shrink-0 w-16 h-16 bg-dark-900 rounded-lg border border-dark-700 overflow-hidden">
                      {f.mimeType?.startsWith('image') ? (
                          <img src={f.previewUrl} className="w-full h-full object-cover" />
                      ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-center p-1 text-gray-400">FILE</div>
                      )}
                      <button 
                        onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0 right-0 bg-red-500/80 text-white w-4 h-4 flex items-center justify-center text-xs rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                          ×
                      </button>
                  </div>
              ))}
          </div>
      );
  };

  // --- UI Parts ---

  const renderStep1 = () => (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div className="bg-dark-900 border border-dark-800 p-8 rounded-2xl shadow-xl">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="bg-brand-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
          上传标杆视频
        </h3>
        
        <div className="space-y-6">
          <div>
            <label className="block text-gray-400 text-sm mb-2">视频链接 (可选)</label>
            <input 
              type="text" 
              value={refUrl}
              onChange={(e) => setRefUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..." 
              className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:border-brand-500"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-dark-700"></div></div>
            <div className="relative flex justify-center text-sm"><span className="px-2 bg-dark-900 text-gray-500">或者 (推荐)</span></div>
          </div>

          <div 
            onClick={() => refFileInputRef.current?.click()}
            className="border-2 border-dashed border-dark-600 hover:border-brand-500 hover:bg-dark-800/50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all"
          >
            <input type="file" ref={refFileInputRef} onChange={handleRefFileChange} accept="video/*" className="hidden" />
            {refFile ? (
              <div className="text-center">
                <p className="text-green-400 font-bold text-lg">✅ {refFile.file.name}</p>
                <p className="text-gray-500 text-sm mt-1">点击更换</p>
              </div>
            ) : (
              <>
                <span className="text-4xl mb-2">📹</span>
                <p className="text-gray-300">上传视频文件</p>
                <p className="text-xs text-gray-500 mt-1">AI 可逐帧分析视觉与节奏</p>
              </>
            )}
          </div>

          <button 
            onClick={startAnalysis}
            disabled={isAnalyzing || (!refUrl && !refFile)}
            className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-brand-500/20 transition-all disabled:opacity-50"
          >
            {isAnalyzing ? (
              <div className="flex items-center justify-center gap-2">
                 <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                 AI 正在深度拆解视频...
              </div>
            ) : '开始拆解分析 🚀'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-dark-900 rounded-2xl border border-dark-800 overflow-hidden shadow-2xl relative animate-fade-in">
       {/* Header */}
       <div className="bg-dark-800 p-4 border-b border-dark-700 flex justify-between items-center shrink-0 z-10">
          <div className="flex items-center gap-2">
            <span className="bg-brand-600 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white">2</span>
            <span className="font-bold text-white">标杆分析与讨论</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white px-3 py-1.5 text-sm">← 重选</button>
            <button 
                onClick={() => setStep(3)} 
                className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg animate-pulse"
            >
                下一步：开始仿写 →
            </button>
          </div>
       </div>

       {/* Chat Area */}
       <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-dark-950/50">
          {step2Messages.map((msg) => (
             <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in-up`}>
               <div className={`max-w-[90%] rounded-2xl p-5 shadow-md ${
                 msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-none' : 'bg-dark-800 text-gray-100 rounded-bl-none border border-dark-700'
               }`}>
                 <div id={`msg-content-${msg.id}`} className="prose prose-invert prose-brand max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                       table: ({node, ...props}) => <div className="overflow-x-auto my-4 border border-dark-700 rounded-lg"><table className="min-w-full divide-y divide-dark-700" {...props} /></div>,
                       th: ({node, ...props}) => <th className="px-3 py-2 bg-dark-900 text-left text-xs font-medium text-gray-300 uppercase tracking-wider border-r border-dark-700 last:border-r-0" {...props} />,
                       td: ({node, ...props}) => <td className="px-3 py-2 whitespace-normal text-sm text-gray-200 border-r border-dark-700 last:border-r-0 border-t border-dark-700" {...props} />
                    }}>{msg.content}</ReactMarkdown>
                 </div>
               </div>
               {msg.role === 'model' && (
                 <div className="mt-2 ml-1">
                     <button 
                       onClick={() => generatePDF(msg.id, msg.content)}
                       className="text-xs text-gray-500 hover:text-brand-300 flex items-center gap-1"
                     >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        下载分析报告
                     </button>
                 </div>
               )}
             </div>
          ))}
          {step2Typing && (
             <div className="flex justify-start">
               <div className="bg-dark-800 rounded-2xl rounded-bl-none px-4 py-3 border border-dark-700 flex gap-1">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75"></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></div>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
       </div>

       {/* Input Area */}
       <div className="bg-dark-800 border-t border-dark-700 shrink-0">
          {renderChatFilePreviews(step2Files, setStep2Files)}
          <div className="p-4 flex gap-3 max-w-4xl mx-auto">
             <button 
               onClick={() => step2FileInputRef.current?.click()}
               className="bg-dark-900 border border-dark-600 text-gray-400 hover:text-white px-3 rounded-xl hover:border-brand-500 transition-colors"
               title="上传文件/图片"
             >
                📎
                <input type="file" multiple ref={step2FileInputRef} onChange={(e) => handleChatFilesChange(e, setStep2Files)} className="hidden" />
             </button>
             <input 
               value={step2Input}
               onChange={(e) => setStep2Input(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleStep2Send()}
               placeholder="输入消息，可粘贴网址链接..."
               className="flex-1 bg-dark-950 border border-dark-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
               disabled={step2Typing}
             />
             <button onClick={handleStep2Send} disabled={(!step2Input.trim() && step2Files.length === 0) || step2Typing} className="bg-brand-600 text-white px-6 rounded-xl font-bold disabled:opacity-50">发送</button>
          </div>
       </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
       <button onClick={() => setStep(2)} className="text-gray-400 hover:text-white mb-2">← 返回讨论</button>
       <div className="bg-dark-900 border border-dark-800 p-8 rounded-2xl shadow-xl">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="bg-brand-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">3</span>
          你的创作计划
        </h3>

        <div className="space-y-6">
          <div>
            <label className="block text-gray-400 text-sm mb-2">你的创意 / 想法</label>
            <textarea 
              value={userIdea}
              onChange={(e) => setUserIdea(e.target.value)}
              placeholder="例如：我也想拍一个类似的视频，但是我是在咖啡店场景，想强调..." 
              className="w-full bg-dark-950 border border-dark-700 rounded-lg p-4 text-white h-32 resize-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-2">上传你的素材 (可选)</label>
            <div className="flex gap-4 overflow-x-auto pb-4">
               <div 
                  onClick={() => userFileInputRef.current?.click()}
                  className="w-24 h-24 shrink-0 border-2 border-dashed border-dark-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-brand-500 hover:bg-dark-800 transition-colors"
               >
                  <span className="text-2xl text-gray-400">＋</span>
                  <input type="file" multiple ref={userFileInputRef} onChange={handleUserFilesChange} className="hidden" />
               </div>
               {userFiles.map((f, i) => (
                 <div key={i} className="w-24 h-24 shrink-0 relative bg-dark-800 rounded-lg border border-dark-700 overflow-hidden">
                    {f.mimeType?.startsWith('image') ? <img src={f.previewUrl} className="w-full h-full object-cover opacity-80" /> : <div className="flex items-center justify-center h-full text-xs p-1 text-center text-gray-300">{f.file.name}</div>}
                 </div>
               ))}
            </div>
          </div>

          <button 
            onClick={startImitation}
            disabled={isAnalyzing}
            className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-brand-500/20 transition-all disabled:opacity-50"
          >
            {isAnalyzing ? (
              <div className="flex items-center justify-center gap-2">
                 <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                 正在根据你的讨论生成指南...
              </div>
            ) : '生成复刻指南 ✨'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-dark-900 rounded-2xl border border-dark-800 overflow-hidden shadow-2xl relative animate-fade-in">
        <div className="bg-dark-800 p-4 border-b border-dark-700 flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">AI 仿写导师</span>
            <span className="text-xs bg-brand-900 text-brand-300 px-2 py-0.5 rounded-full">Step 4</span>
          </div>
          <button onClick={resetAll} className="text-xs text-red-400 hover:text-red-300">结束会话</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-dark-950/50">
           {messages.map((msg) => (
             <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in-up`}>
               <div className={`max-w-[90%] rounded-2xl p-5 shadow-md ${
                 msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-none' : 'bg-dark-800 text-gray-100 rounded-bl-none border border-dark-700'
               }`}>
                 <div id={`msg-content-${msg.id}`} className="prose prose-invert prose-brand max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                       table: ({node, ...props}) => <div className="overflow-x-auto my-4 border border-dark-700 rounded-lg"><table className="min-w-full divide-y divide-dark-700" {...props} /></div>,
                       th: ({node, ...props}) => <th className="px-3 py-2 bg-dark-900 text-left text-xs font-medium text-gray-300 uppercase tracking-wider border-r border-dark-700 last:border-r-0" {...props} />,
                       td: ({node, ...props}) => <td className="px-3 py-2 whitespace-normal text-sm text-gray-200 border-r border-dark-700 last:border-r-0 border-t border-dark-700" {...props} />
                    }}>{msg.content}</ReactMarkdown>
                    
                    {/* Media Display */}
                    {msg.generatedMedia && (
                        <div className="mt-4 rounded-xl overflow-hidden border border-dark-600 bg-black/40">
                            {msg.generatedMedia.type === 'image' ? (
                                <img src={msg.generatedMedia.url} className="w-full h-auto max-h-[400px] object-contain" alt="Generated" />
                            ) : (
                                <video src={msg.generatedMedia.url} controls className="w-full h-auto max-h-[400px]" />
                            )}
                            <div className="p-3 bg-dark-900/80 flex justify-between items-center border-t border-dark-700">
                                <span className="text-xs text-gray-400 truncate flex-1 mr-2">
                                  {msg.generatedMedia.type === 'image' ? '🖼️ Imagen 3' : '🎥 Veo Video'}
                                </span>
                                <button 
                                  onClick={() => downloadMedia(msg.generatedMedia!)}
                                  className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                  下载
                                </button>
                            </div>
                        </div>
                    )}
                 </div>
               </div>
               
               {msg.role === 'model' && !msg.generatedMedia && !msg.isThinking && (
                 <div className="mt-2 ml-1 flex gap-2">
                     <button 
                       onClick={() => generatePDF(msg.id, msg.content)}
                       disabled={downloadingId === msg.id}
                       className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 px-2 py-1 rounded bg-brand-900/20 border border-brand-900/50 hover:bg-brand-900/40 transition-colors"
                     >
                        {downloadingId === msg.id ? (
                           <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                           <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        )}
                        下载 PDF 指南
                     </button>
                 </div>
               )}
             </div>
           ))}
           <div ref={messagesEndRef} />
        </div>

        <div className="bg-dark-800 border-t border-dark-700 shrink-0 relative">
          {/* Generation Modal Popup */}
          {showGenModal && (
            <div className="absolute bottom-full left-0 right-0 bg-dark-800 border-t border-dark-700 p-6 shadow-2xl animate-fade-in-up z-20">
               <div className="max-w-4xl mx-auto">
                 <div className="flex justify-between items-center mb-4">
                    <h4 className="text-white font-bold flex items-center gap-2">
                       ✨ AI 素材生成工厂
                       <span className="text-xs font-normal text-gray-400 px-2 py-0.5 bg-dark-700 rounded">
                         {genType === 'image' ? 'Gemini Image (Imagen 3)' : 'Veo Video Generation'}
                       </span>
                    </h4>
                    <button onClick={() => setShowGenModal(false)} className="text-gray-400 hover:text-white">✕</button>
                 </div>
                 
                 <div className="flex gap-4 mb-4">
                    <button 
                      onClick={() => setGenType('image')}
                      className={`flex-1 py-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${genType === 'image' ? 'bg-brand-600 border-brand-500 text-white' : 'bg-dark-900 border-dark-700 text-gray-400 hover:border-gray-500'}`}
                    >
                       <span>🖼️</span> 生成参考图
                    </button>
                    <button 
                      onClick={() => setGenType('video')}
                      className={`flex-1 py-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${genType === 'video' ? 'bg-brand-600 border-brand-500 text-white' : 'bg-dark-900 border-dark-700 text-gray-400 hover:border-gray-500'}`}
                    >
                       <span>🎥</span> 生成短视频
                    </button>
                 </div>

                 <div className="space-y-3">
                    <textarea 
                      value={genPrompt}
                      onChange={(e) => setGenPrompt(e.target.value)}
                      placeholder={genType === 'image' ? "描述你想生成的画面，例如：赛博朋克风格的咖啡店，霓虹灯光..." : "描述你想生成的视频，例如：一只猫在太空中飞翔..."}
                      className="w-full bg-dark-950 border border-dark-600 rounded-xl p-4 text-white focus:border-brand-500 h-24 resize-none"
                    />
                    <div className="flex justify-end gap-3">
                       <button onClick={() => setShowGenModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">取消</button>
                       <button 
                         onClick={handleGenSubmit} 
                         disabled={!genPrompt.trim() || isGenerating}
                         className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50"
                       >
                         {isGenerating ? '请求中...' : '立即生成'}
                       </button>
                    </div>
                 </div>
               </div>
            </div>
          )}

          {renderChatFilePreviews(chatFiles, setChatFiles)}
          
          <div className="p-4 flex gap-3 max-w-4xl mx-auto relative z-10">
             <button 
               onClick={() => chatFileInputRef.current?.click()}
               className="bg-dark-900 border border-dark-600 text-gray-400 hover:text-white w-10 h-10 flex items-center justify-center rounded-xl hover:border-brand-500 transition-colors"
               title="上传文件/图片"
             >
                📎
                <input type="file" multiple ref={chatFileInputRef} onChange={(e) => handleChatFilesChange(e, setChatFiles)} className="hidden" />
             </button>
             
             <button 
               onClick={() => setShowGenModal(!showGenModal)}
               className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-colors ${showGenModal ? 'bg-brand-600 text-white border-brand-500' : 'bg-dark-900 border-dark-600 text-brand-400 hover:text-brand-300 hover:border-brand-500'}`}
               title="AI 生成图片/视频"
             >
                ✨
             </button>

             <input 
               value={chatInput}
               onChange={(e) => setChatInput(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
               placeholder="继续提问，或点击 ✨ 生成素材..."
               className="flex-1 bg-dark-950 border border-dark-600 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-brand-500"
               disabled={isTyping}
             />
             <button onClick={sendMessage} disabled={(!chatInput.trim() && chatFiles.length === 0) || isTyping} className="bg-brand-600 text-white px-6 rounded-xl font-bold disabled:opacity-50">发送</button>
          </div>
        </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {step !== 4 && step !== 2 && (
        <div className="mb-8 text-center animate-fade-in">
           <h2 className="text-3xl font-bold text-white">爆款仿写大师</h2>
           <p className="text-gray-400">拆解标杆视频，复刻爆款基因</p>
        </div>
      )}
      <div className="flex-1 min-h-0">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </div>
    </div>
  );
};

export default BenchmarkStudio;