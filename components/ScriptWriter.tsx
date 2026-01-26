
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2pdf from 'html2pdf.js';
import { createScriptWriterSession, sendScriptMessage } from '../services/geminiService';
import { Platform, ScriptParams, FileData, ChatMessage } from '../types';
import { Chat, GenerateContentResponse } from "@google/genai";
import { PromptPicker } from './PromptLibrary';

interface ScriptWriterProps {
  initialParams?: Partial<ScriptParams> | null;
}

const ScriptWriter: React.FC<ScriptWriterProps> = ({ initialParams }) => {
  // Step 1: Form, Step 2: Chat
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ScriptParams>({
    platform: Platform.TIKTOK,
    topic: '',
    targetAudience: '',
    tone: '幽默搞笑 & 接地气',
    durationSeconds: 30,
    avoidance: '',
    referenceLinks: []
  });
  
  // Initialize with passed params if available
  useEffect(() => {
    if (initialParams) {
      setFormData(prev => ({
        ...prev,
        ...initialParams
      }));
    }
  }, [initialParams]);
  
  // File Upload State
  const [refFiles, setRefFiles] = useState<FileData[]>([]);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  // Link Input State
  const [newLink, setNewLink] = useState('');

  // Chat State
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => scrollToBottom(), [messages, loading]);

  // --- Helper: Process Files ---
  const processFiles = (files: FileList): Promise<FileData[]> => {
      return Promise.all(Array.from(files).map(file => new Promise<FileData>((resolve) => {
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const processed = await processFiles(e.target.files);
          setRefFiles(prev => [...prev, ...processed]);
      }
      if (refFileInputRef.current) refFileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
      setRefFiles(prev => prev.filter(f => f.id !== id));
  };

  // --- Handlers ---
  const handleChange = (field: keyof ScriptParams, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddLink = () => {
      if(newLink.trim()) {
          setFormData(prev => ({
              ...prev,
              referenceLinks: [...(prev.referenceLinks || []), newLink.trim()]
          }));
          setNewLink('');
      }
  };

  const handleRemoveLink = (idx: number) => {
      setFormData(prev => ({
          ...prev,
          referenceLinks: (prev.referenceLinks || []).filter((_, i) => i !== idx)
      }));
  };

  const handleGenerate = async () => {
    if (!formData.topic) return;
    setLoading(true);
    setStep(2);
    setMessages([]); // Clear previous messages

    try {
      // Pass both params and files to the service
      const { chat, initialResponseStream } = await createScriptWriterSession(formData, refFiles);
      setChatSession(chat);
      
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
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: '❌ 生成失败，请检查网络或 API Key', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
      if (!chatInput.trim() || !chatSession) return;
      const text = chatInput;
      setChatInput('');
      
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() }]);
      setLoading(true);

      try {
        const stream = await sendScriptMessage(chatSession, text);
        const msgId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, { id: msgId, role: 'model', content: '', timestamp: Date.now() }]);
        
        let fullText = "";
        for await (const chunk of stream) {
            const c = chunk as GenerateContentResponse;
            fullText += (c.text || "");
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
        }
      } catch(e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  const handleReset = () => {
    if(confirm('确定要重新开始吗？当前对话将丢失。')) {
        setStep(1);
        setMessages([]);
        setChatSession(null);
    }
  };

  const downloadMarkdown = (content: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ViralFlow_Script_${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generatePDF = async (messageId: string, content: string) => {
    const element = document.getElementById(`script-msg-${messageId}`);
    if(!element) return;
    
    // Simple PDF logic
    const opt = {
        margin: 10,
        filename: `ViralFlow_Script_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    // @ts-ignore
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col">
      {step === 1 && (
         <div className="mb-6 animate-fade-in">
           <h2 className="text-3xl font-bold text-white">脚本创作工坊</h2>
           <p className="text-gray-400">算法驱动的脚本写作，支持 NotebookLM 和多模态参考资料</p>
         </div>
      )}

      {/* Main Container */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        
        {/* Input Panel (Hidden on Step 2 mobile/small screens, or if user wants full chat) */}
        {step === 1 ? (
        <div className="w-full bg-dark-800 rounded-2xl border border-dark-700 p-6 overflow-y-auto custom-scrollbar animate-fade-in">
          <div className="space-y-6 max-w-3xl mx-auto">
            
            {/* Platform Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">发布平台</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.values(Platform).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleChange('platform', p)}
                    className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                      formData.platform === p 
                        ? 'bg-brand-600 border-brand-500 text-white' 
                        : 'bg-dark-900 border-dark-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Core Info */}
            <div>
              <div className="flex justify-between items-center mb-1">
                 <label className="block text-sm font-medium text-gray-400">视频主题 <span className="text-red-500">*</span></label>
                 <PromptPicker onSelect={(val) => handleChange('topic', val)} currentValue={formData.topic} />
              </div>
              <textarea
                value={formData.topic}
                onChange={(e) => handleChange('topic', e.target.value)}
                placeholder="例如：新手如何使用 Gemini API..."
                className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500 h-20 resize-none"
              />
            </div>

            {/* Target & Tone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div>
                  <div className="flex justify-between items-center mb-1">
                     <label className="block text-sm font-medium text-gray-400">目标受众</label>
                     <PromptPicker onSelect={(val) => handleChange('targetAudience', val)} currentValue={formData.targetAudience} />
                  </div>
                  <input
                    type="text"
                    value={formData.targetAudience}
                    onChange={(e) => handleChange('targetAudience', e.target.value)}
                    placeholder="例如：Z世代学生、宝妈"
                    className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500"
                  />
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">视频基调</label>
                  <select
                    value={formData.tone}
                    onChange={(e) => handleChange('tone', e.target.value)}
                    className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500"
                  >
                    <option>幽默搞笑 & 接地气</option>
                    <option>专业干货 & 教育科普</option>
                    <option>激情亢奋 & 强节奏</option>
                    <option>治愈系 & 唯美风</option>
                    <option>观点犀利 & 引起争议</option>
                  </select>
               </div>
            </div>

            {/* Duration (Custom Input) */}
            <div>
               <label className="block text-sm font-medium text-gray-400 mb-2">预计时长 (秒)</label>
               <div className="flex gap-2 mb-2">
                 {[15, 30, 60, 90].map(sec => (
                   <button 
                     key={sec}
                     onClick={() => handleChange('durationSeconds', sec)}
                     className={`text-xs px-3 py-1 rounded-full border ${Number(formData.durationSeconds) === sec ? 'bg-brand-900 border-brand-500 text-brand-200' : 'bg-dark-900 border-dark-700 text-gray-400'}`}
                   >
                     {sec}s
                   </button>
                 ))}
               </div>
               <input
                 type="number"
                 value={formData.durationSeconds}
                 onChange={(e) => handleChange('durationSeconds', e.target.value)}
                 placeholder="输入自定义时长（秒）"
                 className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500"
               />
            </div>

            {/* Reference Material (Updated) */}
            <div className="border-t border-dark-700 pt-4">
                <label className="block text-sm font-medium text-brand-300 mb-3 flex items-center gap-2">
                   📚 参考资料 & 知识库
                </label>
                
                {/* NotebookLM Specific Section */}
                <div className="bg-dark-900 border border-dark-700 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                         <div className="flex items-center gap-2">
                            <span className="text-xl">📓</span>
                            <span className="text-sm font-bold text-white">NotebookLM</span>
                         </div>
                         <a href="https://notebooklm.google.com/" target="_blank" rel="noopener noreferrer" className="text-xs bg-dark-800 hover:bg-dark-700 text-brand-400 border border-dark-600 px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors">
                            打开 NotebookLM ↗
                         </a>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                       如果您在 NotebookLM 中有整理好的研究笔记，请将其生成的分享链接或摘要内容粘贴在下方。
                    </p>
                    <div className="flex gap-2">
                       <input 
                         value={newLink}
                         onChange={(e) => setNewLink(e.target.value)}
                         onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                         placeholder="粘贴 NotebookLM 分享链接或网络文章链接..."
                         className="flex-1 bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500"
                       />
                       <button onClick={handleAddLink} className="bg-dark-700 hover:bg-dark-600 text-white px-3 py-2 rounded-lg text-sm">添加链接</button>
                   </div>
                </div>

                {/* File Upload */}
                <div className="mb-4">
                   <div className="flex flex-wrap gap-2 mb-2">
                       {refFiles.map(f => (
                           <div key={f.id} className="bg-dark-900 border border-dark-600 rounded-lg p-2 flex items-center gap-2 pr-3 max-w-[200px]">
                               <div className="w-8 h-8 shrink-0 bg-dark-800 rounded flex items-center justify-center text-xs overflow-hidden">
                                  {f.mimeType?.startsWith('image') ? <img src={f.previewUrl} className="w-full h-full object-cover"/> : '📄'}
                               </div>
                               <span className="text-xs text-gray-300 truncate flex-1">{f.file.name}</span>
                               <button onClick={() => removeFile(f.id)} className="text-gray-500 hover:text-red-400">×</button>
                           </div>
                       ))}
                       <button 
                         onClick={() => refFileInputRef.current?.click()}
                         className="border border-dashed border-dark-500 hover:border-brand-500 hover:text-brand-400 text-gray-400 rounded-lg px-4 py-2 text-sm transition-colors flex items-center gap-1"
                       >
                         <span>+</span> 上传本地文件
                       </button>
                   </div>
                   <input type="file" multiple ref={refFileInputRef} onChange={handleFileChange} className="hidden" />
                </div>

                {/* Link List */}
                <div className="space-y-2">
                   {formData.referenceLinks?.map((link, idx) => (
                       <div key={idx} className="flex gap-2 items-center bg-dark-900 px-3 py-1.5 rounded border border-dark-700">
                           <span className="text-xs text-blue-400">🔗</span>
                           <input disabled value={link} className="flex-1 bg-transparent border-none text-xs text-gray-400 focus:outline-none" />
                           <button onClick={() => handleRemoveLink(idx)} className="text-red-500 hover:text-red-400 text-xs">移除</button>
                       </div>
                   ))}
                </div>
            </div>

            {/* Avoidance */}
            <div className="border-t border-dark-700 pt-4">
               <div className="flex justify-between items-center mb-1">
                 <label className="block text-sm font-medium text-red-400">⛔ 避坑指南 / 禁忌事项</label>
                 <PromptPicker onSelect={(val) => handleChange('avoidance', val)} currentValue={formData.avoidance} />
               </div>
               <textarea
                 value={formData.avoidance}
                 onChange={(e) => handleChange('avoidance', e.target.value)}
                 placeholder="例如：不要使用过于专业的术语，不要包含政治敏感话题，避免说教语气..."
                 className="w-full bg-dark-950 border border-red-900/30 rounded-lg p-3 text-white focus:ring-1 focus:ring-red-500 h-20 resize-none placeholder-gray-600"
               />
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading || !formData.topic}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-brand-500/20"
            >
              {loading ? '正在深度研读资料并撰写...' : '✨ 生成爆款脚本'}
            </button>
          </div>
        </div>
        ) : (
        /* Chat Panel (Step 2) */
        <div className="flex-1 flex flex-col bg-dark-900 rounded-2xl border border-dark-800 overflow-hidden shadow-2xl animate-fade-in relative">
           {/* Header */}
           <div className="bg-dark-800 p-4 border-b border-dark-700 flex justify-between items-center z-10 shrink-0">
             <div className="flex items-center gap-2">
               <button onClick={handleReset} className="text-gray-400 hover:text-white mr-2">← 返回修改</button>
               <span className="font-semibold text-white">脚本创作对话</span>
             </div>
             <div className="flex gap-2">
                <button onClick={() => handleReset()} className="text-xs text-red-400 hover:text-red-300">新创作</button>
             </div>
           </div>

           {/* Messages */}
           <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-dark-950/50">
             {messages.map((msg) => (
               <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in-up`}>
                 <div className={`max-w-[90%] rounded-2xl p-5 shadow-md ${
                   msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-none' : 'bg-dark-800 text-gray-100 rounded-bl-none border border-dark-700'
                 }`}>
                   <div id={`script-msg-${msg.id}`} className="prose prose-invert prose-brand max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          table: ({node, ...props}) => <div className="overflow-x-auto my-4 border border-dark-700 rounded-lg"><table className="min-w-full divide-y divide-dark-700" {...props} /></div>,
                      }}>{msg.content}</ReactMarkdown>
                   </div>
                 </div>
                 
                 {/* Action Buttons for Model Messages */}
                 {msg.role === 'model' && !loading && (
                    <div className="flex gap-2 mt-2 ml-1">
                        <button 
                            onClick={() => downloadMarkdown(msg.content)}
                            className="flex items-center gap-1 text-xs bg-dark-800 hover:bg-dark-700 border border-dark-600 px-3 py-1.5 rounded transition-colors text-gray-300"
                        >
                            <span>⬇️</span> MD
                        </button>
                        <button 
                            onClick={() => generatePDF(msg.id, msg.content)}
                            className="flex items-center gap-1 text-xs bg-dark-800 hover:bg-dark-700 border border-dark-600 px-3 py-1.5 rounded transition-colors text-gray-300"
                        >
                            <span>📄</span> PDF
                        </button>
                    </div>
                 )}
               </div>
             ))}
             {loading && (
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
           <div className="p-4 bg-dark-800 border-t border-dark-700 shrink-0">
              <div className="flex gap-3 max-w-4xl mx-auto items-center">
                 <PromptPicker onSelect={(val) => setChatInput(val)} currentValue={chatInput} position="top" />
                 <input 
                   value={chatInput}
                   onChange={(e) => setChatInput(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                   placeholder="对脚本不满意？请告诉我如何修改（例如：更幽默一点、缩短开头...）"
                   className="flex-1 bg-dark-950 border border-dark-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                   disabled={loading}
                 />
                 <button onClick={handleSendMessage} disabled={!chatInput.trim() || loading} className="bg-brand-600 text-white px-6 rounded-xl font-bold disabled:opacity-50">发送</button>
              </div>
           </div>
        </div>
        )}

      </div>
    </div>
  );
};

export default ScriptWriter;
