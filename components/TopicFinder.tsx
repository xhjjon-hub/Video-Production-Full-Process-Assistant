
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { researchTopics, createTopicChatSession, sendAuditMessage } from '../services/geminiService';
import { Platform, TopicResult, FileData, ScriptParams, ChatMessage } from '../types';
import { PromptPicker } from './PromptLibrary';
import { Chat, GenerateContentResponse } from '@google/genai';

interface TopicFinderProps {
  onNavigateToScript?: (params: Partial<ScriptParams>) => void;
}

const TopicFinder: React.FC<TopicFinderProps> = ({ onNavigateToScript }) => {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('通用');
  const [platform, setPlatform] = useState<Platform>(Platform.TIKTOK);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TopicResult[]>([]);
  const [error, setError] = useState('');
  const [batchIndex, setBatchIndex] = useState(0);

  // New State for Multimodal Input
  const [refFiles, setRefFiles] = useState<FileData[]>([]);
  const [refLinks, setRefLinks] = useState<string[]>([]);
  const [newRefLink, setNewRefLink] = useState('');
  
  const [benchmarkFiles, setBenchmarkFiles] = useState<FileData[]>([]);
  const [benchmarkLinks, setBenchmarkLinks] = useState<string[]>([]);
  const [newBenchmarkLink, setNewBenchmarkLink] = useState('');

  const refFileInputRef = useRef<HTMLInputElement>(null);
  const benchmarkFileInputRef = useRef<HTMLInputElement>(null);

  // --- Topic Chat State ---
  const [activeTopic, setActiveTopic] = useState<TopicResult | null>(null);
  const [topicChatSession, setTopicChatSession] = useState<Chat | null>(null);
  const [topicChatMessages, setTopicChatMessages] = useState<ChatMessage[]>([]);
  const [topicChatInput, setTopicChatInput] = useState('');
  const [isTopicChatTyping, setIsTopicChatTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Helper: Process Files (Reused logic) ---
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
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      let mimeType = fileData.file.type;
      if (fileData.file.name.endsWith('.pdf')) mimeType = 'application/pdf';
      setFileState(prev => prev.map(f => f.id === fileData.id ? { ...f, base64: base64String, mimeType: mimeType, uploadStatus: 'success', uploadProgress: 100 } : f));
    };
    reader.readAsDataURL(fileData.file);
  };

  const handleRefFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = processFileList(e.target.files);
      setRefFiles(prev => [...prev, ...newFiles]);
      newFiles.forEach(f => readFileContent(f, setRefFiles));
    }
  };

  const handleBenchmarkFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = processFileList(e.target.files);
      setBenchmarkFiles(prev => [...prev, ...newFiles]);
      newFiles.forEach(f => readFileContent(f, setBenchmarkFiles));
    }
  };

  const addLink = (link: string, setLinks: React.Dispatch<React.SetStateAction<string[]>>, setInput: React.Dispatch<React.SetStateAction<string>>) => {
    if (link.trim()) {
      setLinks(prev => [...prev, link.trim()]);
      setInput('');
    }
  };

  // --- Main Action ---
  const fetchTopics = async (currentBatchIndex: number) => {
    setLoading(true);
    setError('');

    // Prepare payloads
    const contextPayload = refFiles.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));
    const benchmarkPayload = benchmarkFiles.map(f => ({ data: f.base64!, mimeType: f.mimeType! }));

    try {
      const data = await researchTopics(
        query, 
        domain, 
        platform, 
        contextPayload, 
        refLinks, 
        benchmarkPayload, 
        benchmarkLinks, 
        currentBatchIndex
      );
      setResults(data);
    } catch (err) {
      setError('获取选题失败，请检查 API Key 并重试。');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchIndex(0);
    setResults([]); 
    fetchTopics(0);
  };

  const handleSwapBatch = () => {
    const nextBatch = batchIndex + 1;
    setBatchIndex(nextBatch);
    fetchTopics(nextBatch);
  };

  const handleCopyUrl = (e: React.MouseEvent<HTMLButtonElement>, url: string) => {
    e.preventDefault();
    navigator.clipboard.writeText(url);
    const btn = e.currentTarget;
    const originalText = btn.innerText;
    btn.innerText = '已复制';
    btn.classList.add('text-green-400');
    setTimeout(() => {
      btn.innerText = originalText;
      btn.classList.remove('text-green-400');
    }, 2000);
  };

  // --- Topic Chat Logic ---
  const openTopicChat = (topic: TopicResult) => {
    setActiveTopic(topic);
    const chat = createTopicChatSession(topic, platform);
    setTopicChatSession(chat);
    setTopicChatMessages([
        { id: 'sys-1', role: 'model', content: `你好！关于“${topic.title}”这个选题，你想怎么改进？\n比如：\n- 帮我优化标题\n- 设计3个开头Hook\n- 扩展成1分钟脚本大纲`, timestamp: Date.now() }
    ]);
  };

  const sendTopicChatMessage = async () => {
      if(!topicChatInput.trim() || !topicChatSession) return;
      const text = topicChatInput;
      setTopicChatInput('');
      setTopicChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() }]);
      setIsTopicChatTyping(true);

      try {
          const stream = await sendAuditMessage(topicChatSession, text); // Reusing generic send message function
          const msgId = (Date.now()+1).toString();
          setTopicChatMessages(prev => [...prev, { id: msgId, role: 'model', content: '', timestamp: Date.now() }]);
          
          let fullText = "";
          for await (const chunk of stream) {
            const c = chunk as GenerateContentResponse;
            fullText += (c.text || "");
            setTopicChatMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
          }
      } catch(e) { console.error(e) }
      finally { setIsTopicChatTyping(false); }
  };

  const closeTopicChat = () => {
      setActiveTopic(null);
      setTopicChatSession(null);
      setTopicChatMessages([]);
  };

  useEffect(() => {
      if(activeTopic) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [topicChatMessages, isTopicChatTyping]);


  // --- Proceed to Script Logic ---
  const handleProceedToScript = (topic: TopicResult) => {
      if(onNavigateToScript) {
          onNavigateToScript({
              platform,
              topic: topic.title,
              targetAudience: "通用", 
              referenceLinks: topic.sources?.map(s => s.url) || []
          });
      }
  };


  const renderFileBadge = (f: FileData, removeFn: (id: string) => void) => (
      <div key={f.id} className="flex items-center gap-2 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs">
         <span className="truncate max-w-[100px] text-gray-300">{f.file.name}</span>
         <button onClick={() => removeFn(f.id)} className="text-red-400 hover:text-white">×</button>
      </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12 relative">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-white">多模态选题灵感引擎</h2>
        <p className="text-gray-400">结合实时趋势、您的素材与对标风格，生成精准爆款选题</p>
      </div>

      <form onSubmit={handleSearch} className="bg-dark-800 p-6 rounded-2xl border border-dark-800 shadow-2xl space-y-6">
        {/* 1. Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">目标平台</label>
            <select 
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="w-full bg-dark-950 border border-dark-800 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              {Object.values(Platform).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">领域 / 赛道</label>
            <input 
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="例如：科技、美妆、理财"
              className="w-full bg-dark-950 border border-dark-800 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
        </div>

        {/* 2. Main Query */}
        <div>
          <div className="flex justify-between items-center mb-1">
             <label className="block text-sm font-medium text-gray-400">你想探索什么方向？(可选)</label>
             <PromptPicker onSelect={setQuery} currentValue={query} />
          </div>
          <div className="relative">
            <input 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例如：最新 AI 工具、夏日穿搭... (不填则基于上传材料生成)"
              className="w-full bg-dark-950 border border-dark-800 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:outline-none pl-10"
            />
            <span className="absolute left-3 top-3.5 text-gray-500">🔎</span>
          </div>
        </div>

        {/* 3. Reference Material (Context) */}
        <div className="border border-dark-700 rounded-xl p-4 bg-dark-900/30">
            <h4 className="text-sm font-bold text-blue-400 mb-2 flex items-center gap-2">
                📚 内容素材箱 <span className="text-gray-500 font-normal text-xs">(AI 将从中提取知识点和事实)</span>
            </h4>
            <div className="flex flex-col gap-3">
                <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => refFileInputRef.current?.click()} className="text-xs bg-dark-800 hover:bg-dark-700 border border-dark-600 px-3 py-2 rounded text-gray-300 flex items-center gap-1">
                        📂 上传文档/图片
                        <input type="file" multiple ref={refFileInputRef} onChange={handleRefFilesChange} className="hidden" />
                    </button>
                    {refFiles.map(f => renderFileBadge(f, (id) => setRefFiles(prev => prev.filter(x => x.id !== id))))}
                </div>
                <div className="flex gap-2">
                    <input 
                        value={newRefLink} 
                        onChange={e => setNewRefLink(e.target.value)} 
                        placeholder="粘贴文章或 NotebookLM 链接..."
                        className="flex-1 bg-dark-950 border border-dark-700 rounded px-3 py-1 text-xs text-white"
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLink(newRefLink, setRefLinks, setNewRefLink))}
                    />
                    <button type="button" onClick={() => addLink(newRefLink, setRefLinks, setNewRefLink)} className="text-xs bg-dark-800 px-3 rounded border border-dark-600 text-gray-300">添加</button>
                </div>
                {refLinks.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {refLinks.map((l, i) => (
                            <span key={i} className="text-[10px] bg-blue-900/20 text-blue-300 px-2 py-0.5 rounded border border-blue-900/30 flex items-center gap-1">
                                🔗 {new URL(l).hostname} <button type="button" onClick={() => setRefLinks(p => p.filter((_, idx) => idx !== i))} className="hover:text-white">×</button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* 4. Benchmark Material (Style) */}
        <div className="border border-dashed border-yellow-600/30 rounded-xl p-4 bg-yellow-900/5">
            <h4 className="text-sm font-bold text-yellow-500 mb-2 flex items-center gap-2">
                ⭐ 对标风格库 <span className="text-gray-500 font-normal text-xs">(AI 将模仿其形式、节奏和结构)</span>
            </h4>
            <div className="flex flex-col gap-3">
                <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => benchmarkFileInputRef.current?.click()} className="text-xs bg-dark-800 hover:bg-dark-700 border border-dark-600 px-3 py-2 rounded text-gray-300 flex items-center gap-1">
                        🎥 上传对标视频
                        <input type="file" multiple ref={benchmarkFileInputRef} onChange={handleBenchmarkFilesChange} className="hidden" accept="video/*" />
                    </button>
                    {benchmarkFiles.map(f => renderFileBadge(f, (id) => setBenchmarkFiles(prev => prev.filter(x => x.id !== id))))}
                </div>
                <div className="flex gap-2">
                    <input 
                        value={newBenchmarkLink} 
                        onChange={e => setNewBenchmarkLink(e.target.value)} 
                        placeholder="粘贴爆款视频链接..."
                        className="flex-1 bg-dark-950 border border-dark-700 rounded px-3 py-1 text-xs text-white"
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLink(newBenchmarkLink, setBenchmarkLinks, setNewBenchmarkLink))}
                    />
                    <button type="button" onClick={() => addLink(newBenchmarkLink, setBenchmarkLinks, setNewBenchmarkLink)} className="text-xs bg-dark-800 px-3 rounded border border-dark-600 text-gray-300">添加</button>
                </div>
                {benchmarkLinks.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {benchmarkLinks.map((l, i) => (
                            <span key={i} className="text-[10px] bg-yellow-900/20 text-yellow-300 px-2 py-0.5 rounded border border-yellow-900/30 flex items-center gap-1">
                                🔗 Link <button type="button" onClick={() => setBenchmarkLinks(p => p.filter((_, idx) => idx !== i))} className="hover:text-white">×</button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-semibold py-3 rounded-lg transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
        >
          {loading && results.length === 0 ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              正在分析素材与趋势...
            </>
          ) : '🚀 融合生成爆款选题'}
        </button>
      </form>

      {error && (
        <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg">
          {error}
        </div>
      )}

      {loading && results.length > 0 && (
         <div className="flex justify-center py-4">
             <div className="bg-dark-800 px-4 py-2 rounded-full flex items-center gap-2 border border-dark-700 shadow-xl">
                <svg className="animate-spin h-4 w-4 text-brand-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm text-gray-300">正在寻找新灵感...</span>
             </div>
         </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {results.map((topic, index) => (
          <div key={`${index}-${batchIndex}`} className="bg-dark-800 rounded-xl p-6 border border-dark-700 hover:border-brand-500/50 transition-colors group animate-fade-in-up flex flex-col h-full" style={{ animationDelay: `${index * 100}ms` }}>
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-xl font-bold text-white group-hover:text-brand-300">{topic.title}</h3>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                topic.relevanceScore > 85 ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'
              }`}>
                {topic.relevanceScore}% 匹配度
              </span>
            </div>
            <p className="text-gray-300 text-sm mb-4 line-clamp-3 flex-1">{topic.description}</p>
            
            <div className="bg-dark-900/50 p-3 rounded-lg mb-4">
              <p className="text-xs text-brand-300 font-semibold mb-1">🔥 推荐理由 (结合素材):</p>
              <p className="text-xs text-gray-400">{topic.trendingReason}</p>
            </div>

            {topic.sources && topic.sources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-dark-700 mb-4">
                <p className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-2">
                  <span>🌐</span> 推荐参考视频:
                </p>
                <div className="flex flex-wrap gap-2">
                    {topic.sources.map((s, i) => (
                        <a key={i} href={s.url} target="_blank" className="text-xs text-brand-400 hover:underline truncate max-w-[150px]" title={s.title}>{s.title || 'Link'}</a>
                    ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-auto">
                <button 
                   onClick={() => openTopicChat(topic)}
                   className="flex-1 bg-dark-700 hover:bg-dark-600 text-white py-2 rounded-lg text-sm transition-colors border border-dark-600"
                >
                    💬 对话改进
                </button>
                <button 
                   onClick={() => handleProceedToScript(topic)}
                   className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-brand-500/10"
                >
                    📝 生成脚本
                </button>
            </div>
          </div>
        ))}
      </div>

      {results.length > 0 && (
        <div className="flex justify-center mt-8">
           <button 
             onClick={handleSwapBatch}
             disabled={loading}
             className="flex items-center gap-2 px-8 py-3 bg-dark-800 border border-dark-600 rounded-full text-white hover:bg-dark-700 hover:border-brand-500 transition-all shadow-lg hover:shadow-brand-500/10 disabled:opacity-50"
           >
              <span className="text-xl">🔄</span>
              <span className="font-medium">不满意？换一批 ({batchIndex + 1})</span>
           </button>
        </div>
      )}

      {/* Topic Chat Drawer */}
      {activeTopic && (
          <div className="fixed inset-y-0 right-0 w-full md:w-[450px] bg-dark-900 border-l border-dark-700 shadow-2xl z-50 flex flex-col animate-slide-in-right">
              <div className="p-4 border-b border-dark-700 flex justify-between items-center bg-dark-800">
                  <div>
                      <h3 className="font-bold text-white">选题打磨</h3>
                      <p className="text-xs text-brand-400 truncate max-w-[250px]">{activeTopic.title}</p>
                  </div>
                  <button onClick={closeTopicChat} className="text-gray-400 hover:text-white text-2xl">×</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-dark-950/50">
                  {topicChatMessages.map((msg) => (
                      <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-none' : 'bg-dark-800 text-gray-200 border border-dark-700 rounded-bl-none'}`}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          </div>
                      </div>
                  ))}
                  {isTopicChatTyping && (
                      <div className="flex justify-start"><div className="bg-dark-800 px-3 py-2 rounded-lg border border-dark-700"><span className="animate-pulse text-xs text-gray-400">Thinking...</span></div></div>
                  )}
                  <div ref={chatEndRef} />
              </div>

              <div className="p-4 border-t border-dark-700 bg-dark-800">
                  <div className="flex gap-2">
                      <input 
                        value={topicChatInput}
                        onChange={(e) => setTopicChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendTopicChatMessage()}
                        placeholder="例如：帮我起3个有争议的标题..."
                        className="flex-1 bg-dark-950 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                        disabled={isTopicChatTyping}
                      />
                      <button 
                        onClick={sendTopicChatMessage}
                        disabled={!topicChatInput.trim() || isTopicChatTyping}
                        className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-bold"
                      >
                          发送
                      </button>
                  </div>
                  <button 
                    onClick={() => handleProceedToScript(activeTopic)}
                    className="w-full mt-3 bg-dark-700 hover:bg-dark-600 border border-dark-600 text-gray-300 hover:text-white py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1"
                  >
                      <span>📝</span> 确定选题并去写脚本
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};

export default TopicFinder;
