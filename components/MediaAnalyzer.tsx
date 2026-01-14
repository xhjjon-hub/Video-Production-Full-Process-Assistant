import React, { useState, useRef } from 'react';
import { auditContent } from '../services/geminiService';
import { AuditResult } from '../types';

const MediaAnalyzer: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Basic validation
      if (selectedFile.size > 20 * 1024 * 1024) {
        alert("文件大小必须小于 20MB。");
        return;
      }

      setFile(selectedFile);
      setResult(null);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleAudit = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const audit = await auditContent(base64, file.type, context);
      setResult(audit);
    } catch (error) {
      console.error("Audit failed", error);
      alert("分析失败。请检查 API Key 或文件格式。");
    } finally {
      setLoading(false);
    }
  };

  const mapViralPotential = (potential: string) => {
    switch (potential) {
      case 'Very High': return '极高';
      case 'High': return '高';
      case 'Medium': return '中';
      case 'Low': return '低';
      default: return potential;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white">内容诊断室</h2>
        <p className="text-gray-400">上传草稿，获取 AI 全方位诊断与优化建议</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Upload Section */}
        <div className="space-y-6">
          <div 
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-colors h-80 ${
              preview ? 'border-brand-600/50 bg-brand-900/10' : 'border-dark-700 bg-dark-800 hover:border-gray-500'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange} 
              accept="image/*,video/mp4,video/webm,audio/*,text/plain"
              className="hidden" 
            />
            
            {preview ? (
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-lg">
                 {file?.type.startsWith('image') && <img src={preview} alt="Preview" className="max-h-full object-contain" />}
                 {file?.type.startsWith('video') && <video src={preview} controls className="max-h-full max-w-full" />}
                 {file?.type.startsWith('audio') && <audio src={preview} controls className="w-full" />}
                 {file?.type.startsWith('text') && <div className="text-left text-xs p-4 bg-white text-black h-full w-full overflow-auto whitespace-pre-wrap">{atob(preview.split(',')[1])}</div>}
                 
                 <button 
                  onClick={() => { setFile(null); setPreview(null); setResult(null); }}
                  className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-2 hover:bg-red-600 transition-colors"
                 >
                   ✕
                 </button>
              </div>
            ) : (
              <div className="cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="text-4xl mb-4">📤</div>
                <h3 className="text-lg font-medium text-white mb-2">拖拽文件到此处</h3>
                <p className="text-sm text-gray-500">支持视频、图片、音频 (最大 20MB)</p>
                <button className="mt-4 px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm text-white transition-colors">
                  浏览文件
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">补充背景 (可选)</label>
            <textarea 
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="说明视频目的、预设BGM或具体顾虑..."
              className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500 h-24 resize-none"
            />
          </div>

          <button
            onClick={handleAudit}
            disabled={!file || loading}
            className="w-full bg-gradient-to-r from-brand-600 to-purple-600 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-brand-500/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '正在分析内容...' : '🔍 开始诊断'}
          </button>
        </div>

        {/* Result Section */}
        <div className="bg-dark-900 rounded-2xl border border-dark-800 p-6 min-h-[400px]">
          {!result ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
              <span className="text-6xl mb-4">📊</span>
              <p>诊断报告将在此显示</p>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between border-b border-dark-700 pb-4">
                <h3 className="text-xl font-bold text-white">诊断报告</h3>
                <div className="flex items-center gap-3">
                   <span className="text-sm text-gray-400">爆款指数:</span>
                   <div className="relative w-16 h-16 flex items-center justify-center">
                      <svg className="w-full h-full" viewBox="0 0 36 36">
                        <path className="text-dark-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                        <path className={`${result.score > 70 ? 'text-green-500' : result.score > 40 ? 'text-yellow-500' : 'text-red-500'}`} strokeDasharray={`${result.score}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                      </svg>
                      <span className="absolute text-sm font-bold text-white">{result.score}</span>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-green-900/10 border border-green-900/30 p-4 rounded-xl">
                   <h4 className="text-green-400 font-semibold mb-2 flex items-center gap-2">✅ 亮点分析</h4>
                   <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                     {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
                   </ul>
                 </div>
                 <div className="bg-red-900/10 border border-red-900/30 p-4 rounded-xl">
                   <h4 className="text-red-400 font-semibold mb-2 flex items-center gap-2">⚠️ 待改进</h4>
                   <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                     {result.weaknesses.map((s, i) => <li key={i}>{s}</li>)}
                   </ul>
                 </div>
              </div>

              <div className="bg-brand-900/10 border border-brand-900/30 p-4 rounded-xl">
                 <h4 className="text-brand-300 font-semibold mb-2 flex items-center gap-2">💡 优化建议</h4>
                 <ul className="text-sm text-gray-300 space-y-2">
                   {result.suggestions.map((s, i) => (
                     <li key={i} className="flex gap-2">
                       <span className="text-brand-500">•</span>
                       {s}
                     </li>
                   ))}
                 </ul>
              </div>

              <div className="flex justify-between items-center bg-dark-800 p-3 rounded-lg">
                <span className="text-gray-400 text-sm">爆款潜力预测:</span>
                <span className={`font-bold px-3 py-1 rounded-full text-sm ${
                  result.viralPotential === 'Very High' || result.viralPotential === 'High' 
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' 
                  : 'bg-gray-700 text-gray-300'
                }`}>
                  {mapViralPotential(result.viralPotential)} 🚀
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaAnalyzer;