
import React, { useState } from 'react';
import { researchTopics } from '../services/geminiService';
import { Platform, TopicResult } from '../types';
import { PromptPicker } from './PromptLibrary';

const TopicFinder: React.FC = () => {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('通用');
  const [platform, setPlatform] = useState<Platform>(Platform.TIKTOK);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TopicResult[]>([]);
  const [error, setError] = useState('');
  const [batchIndex, setBatchIndex] = useState(0);

  const fetchTopics = async (currentBatchIndex: number) => {
    setLoading(true);
    setError('');
    // Clear results to show loading state clearly, or keep them if you prefer smoother transition
    // setResults([]); 

    try {
      const data = await researchTopics(query, domain, platform, currentBatchIndex);
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
    if (!query) return;
    setBatchIndex(0);
    setResults([]); // Clear on new search
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

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-white">发现下一个爆款选题</h2>
        <p className="text-gray-400">基于 Google 搜索的实时趋势分析</p>
      </div>

      <form onSubmit={handleSearch} className="bg-dark-800 p-6 rounded-2xl border border-dark-800 shadow-2xl space-y-4">
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

        <div>
          <div className="flex justify-between items-center mb-1">
             <label className="block text-sm font-medium text-gray-400">你想探索什么方向？</label>
             <PromptPicker onSelect={setQuery} currentValue={query} />
          </div>
          <div className="relative">
            <input 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例如：最新 AI 工具、夏日穿搭、健康零食"
              className="w-full bg-dark-950 border border-dark-800 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:outline-none pl-10"
            />
            <span className="absolute left-3 top-3.5 text-gray-500">🔎</span>
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
              正在分析趋势...
            </>
          ) : '生成选题灵感'}
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
          <div key={`${index}-${batchIndex}`} className="bg-dark-800 rounded-xl p-6 border border-dark-700 hover:border-brand-500/50 transition-colors group animate-fade-in-up" style={{ animationDelay: `${index * 100}ms` }}>
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-xl font-bold text-white group-hover:text-brand-300">{topic.title}</h3>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                topic.relevanceScore > 85 ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'
              }`}>
                {topic.relevanceScore}% 匹配度
              </span>
            </div>
            <p className="text-gray-300 text-sm mb-4 line-clamp-3">{topic.description}</p>
            
            <div className="bg-dark-900/50 p-3 rounded-lg mb-4">
              <p className="text-xs text-brand-300 font-semibold mb-1">🔥 爆火理由:</p>
              <p className="text-xs text-gray-400">{topic.trendingReason}</p>
            </div>

            {topic.sources && topic.sources.length > 0 && (
              <div className="mt-4 pt-4 border-t border-dark-700">
                <p className="text-xs text-gray-500 mb-3 font-semibold flex items-center gap-2">
                  <span>🌐</span> 推荐参考视频 ({platform}):
                </p>
                <ul className="space-y-3">
                  {topic.sources.map((source, idx) => (
                    <li key={idx} className="group/source">
                      {/* Source Title Link */}
                      <a 
                        href={source.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-sm text-brand-400 hover:text-brand-300 font-medium hover:underline flex items-center gap-1 mb-1 truncate"
                        title="点击观看视频"
                      >
                        {source.title || `${platform} 视频链接`} 
                        <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                      
                      {/* URL Copy Bar - Boxed separately as requested */}
                      <div className="flex items-center gap-2 bg-dark-950 rounded px-3 py-2 border border-dark-800 group-hover/source:border-dark-600 transition-colors mt-1">
                        <span className="text-[10px] text-gray-500 font-mono truncate flex-1 select-all" title={source.url}>
                          {source.url}
                        </span>
                        <button 
                          onClick={(e) => handleCopyUrl(e, source.url)}
                          className="text-[10px] text-gray-400 hover:text-white bg-dark-800 hover:bg-dark-700 px-2 py-1 rounded transition-colors whitespace-nowrap border border-dark-700"
                        >
                          复制
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
    </div>
  );
};

export default TopicFinder;
