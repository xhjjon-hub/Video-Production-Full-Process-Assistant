import React, { useState } from 'react';
import { researchTopics } from '../services/geminiService';
import { Platform, TopicResult } from '../types';

const TopicFinder: React.FC = () => {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('General');
  const [platform, setPlatform] = useState<Platform>(Platform.TIKTOK);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TopicResult[]>([]);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const data = await researchTopics(query, domain, platform);
      setResults(data);
    } catch (err) {
      setError('Failed to fetch topics. Please check your API key and try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-white">Find Your Next Viral Hit</h2>
        <p className="text-gray-400">Real-time trend analysis powered by Google Search Grounding</p>
      </div>

      <form onSubmit={handleSearch} className="bg-dark-800 p-6 rounded-2xl border border-dark-800 shadow-2xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Target Platform</label>
            <select 
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="w-full bg-dark-950 border border-dark-800 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              {Object.values(Platform).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Niche / Domain</label>
            <input 
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. Tech, Beauty, Finance"
              className="w-full bg-dark-950 border border-dark-800 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">What are you looking for?</label>
          <div className="relative">
            <input 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Latest AI tools, Summer fashion trends, Healthy snacks"
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
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Researching Trends...
            </>
          ) : 'Generate Topic Ideas'}
        </button>
      </form>

      {error && (
        <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {results.map((topic, index) => (
          <div key={index} className="bg-dark-800 rounded-xl p-6 border border-dark-700 hover:border-brand-500/50 transition-colors group">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-xl font-bold text-white group-hover:text-brand-300">{topic.title}</h3>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                topic.relevanceScore > 85 ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'
              }`}>
                {topic.relevanceScore}% Match
              </span>
            </div>
            <p className="text-gray-300 text-sm mb-4 line-clamp-3">{topic.description}</p>
            
            <div className="bg-dark-900/50 p-3 rounded-lg mb-4">
              <p className="text-xs text-brand-300 font-semibold mb-1">🔥 Why Trending:</p>
              <p className="text-xs text-gray-400">{topic.trendingReason}</p>
            </div>

            {topic.sources && topic.sources.length > 0 && (
              <div className="mt-4 pt-4 border-t border-dark-700">
                <p className="text-xs text-gray-500 mb-2">Sources:</p>
                <ul className="space-y-1">
                  {topic.sources.map((source, idx) => (
                    <li key={idx}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                        🔗 {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TopicFinder;