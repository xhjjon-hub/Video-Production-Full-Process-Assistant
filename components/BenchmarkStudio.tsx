import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { analyzeBenchmarkContent, createImitationSession, sendAuditMessage } from '../services/geminiService';
import { ChatMessage, FileData } from '../types';
import { Chat, GenerateContentResponse } from "@google/genai";

const STORAGE_KEY_BENCHMARK = 'viralflow_benchmark_state';

const BenchmarkStudio: React.FC = () => {
  // Steps: 1=Input Benchmark, 2=Review Analysis, 3=Input User Content, 4=Imitation Guide (Chat)
  const [step, setStep] = useState(1);
  
  // Step 1: Benchmark Input
  const [refUrl, setRefUrl] = useState('');
  const [refFile, setRefFile] = useState<FileData | null>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  
  // Step 2: Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');

  // Step 3: User Input
  const [userIdea, setUserIdea] = useState('');
  const [userFiles, setUserFiles] = useState<FileData[]>([]);
  const userFileInputRef = useRef<HTMLInputElement>(null);

  // Step 4: Chat Guide
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BENCHMARK);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only restore steps 1-3 content, chat (step 4) needs live session
        setStep(parsed.step > 3 ? 3 : parsed.step || 1);
        setRefUrl(parsed.refUrl || '');
        setAnalysisResult(parsed.analysisResult || '');
        setUserIdea(parsed.userIdea || '');
      } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_BENCHMARK, JSON.stringify({
      step, refUrl, analysisResult, userIdea
    }));
  }, [step, refUrl, analysisResult, userIdea]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => scrollToBottom(), [messages, isTyping]);

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

  const handleUserFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles: FileData[] = [];
      Array.from(e.target.files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
          setUserFiles(prev => [...prev, {
            id: Math.random().toString(36),
            file,
            previewUrl: URL.createObjectURL(file),
            base64: (reader.result as string).split(',')[1],
            mimeType: file.type,
            uploadStatus: 'success', uploadProgress: 100
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
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
      setStep(2);
    } catch (e) {
      console.error(e);
      alert("分析失败，请检查网络或 Key");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startImitation = async () => {
    setIsAnalyzing(true); // Reuse loading state
    try {
      const assetsPayload = userFiles.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));
      const { chat, initialResponseStream } = await createImitationSession(analysisResult, userIdea, assetsPayload);
      
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
    if (!chatInput.trim() || !chatSession) return;
    const txt = chatInput;
    setChatInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: txt, timestamp: Date.now() }]);
    setIsTyping(true);

    try {
      const stream = await sendAuditMessage(chatSession, txt);
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

  const resetAll = () => {
    if(confirm("确定要重新开始吗？")) {
      setStep(1);
      setRefUrl('');
      setRefFile(null);
      setAnalysisResult('');
      setUserIdea('');
      setUserFiles([]);
      setMessages([]);
      localStorage.removeItem(STORAGE_KEY_BENCHMARK);
    }
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
    <div className="flex flex-col h-full animate-fade-in relative">
       <div className="flex justify-between items-center mb-6 shrink-0">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="bg-brand-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span>
            分析报告
          </h3>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white px-4 py-2">← 重选</button>
            <button onClick={() => setStep(3)} className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                下一步：开始仿写 →
            </button>
          </div>
       </div>
       <div className="bg-dark-900 border border-dark-800 rounded-2xl p-8 overflow-y-auto flex-1 prose prose-invert prose-brand max-w-none shadow-xl">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
             table: ({node, ...props}) => <div className="overflow-x-auto my-4 border border-dark-700 rounded-lg"><table className="min-w-full divide-y divide-dark-700" {...props} /></div>,
             th: ({node, ...props}) => <th className="px-3 py-2 bg-dark-900 text-left text-xs font-medium text-gray-300 uppercase tracking-wider border-r border-dark-700 last:border-r-0" {...props} />,
             td: ({node, ...props}) => <td className="px-3 py-2 whitespace-normal text-sm text-gray-200 border-r border-dark-700 last:border-r-0 border-t border-dark-700" {...props} />
          }}>{analysisResult}</ReactMarkdown>
       </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
       <button onClick={() => setStep(2)} className="text-gray-400 hover:text-white mb-2">← 查看分析</button>
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
                 正在生成制作指南...
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
                 <div className="prose prose-invert prose-brand max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                       table: ({node, ...props}) => <div className="overflow-x-auto my-4 border border-dark-700 rounded-lg"><table className="min-w-full divide-y divide-dark-700" {...props} /></div>,
                       th: ({node, ...props}) => <th className="px-3 py-2 bg-dark-900 text-left text-xs font-medium text-gray-300 uppercase tracking-wider border-r border-dark-700 last:border-r-0" {...props} />,
                       td: ({node, ...props}) => <td className="px-3 py-2 whitespace-normal text-sm text-gray-200 border-r border-dark-700 last:border-r-0 border-t border-dark-700" {...props} />
                    }}>{msg.content}</ReactMarkdown>
                 </div>
               </div>
             </div>
           ))}
           <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-dark-800 border-t border-dark-700 shrink-0">
          <div className="flex gap-3 max-w-4xl mx-auto">
             <input 
               value={chatInput}
               onChange={(e) => setChatInput(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
               placeholder="继续提问：帮我写一段分镜头脚本..."
               className="flex-1 bg-dark-950 border border-dark-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
               disabled={isTyping}
             />
             <button onClick={sendMessage} disabled={!chatInput.trim() || isTyping} className="bg-brand-600 text-white px-6 rounded-xl font-bold disabled:opacity-50">发送</button>
          </div>
        </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {step !== 4 && (
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