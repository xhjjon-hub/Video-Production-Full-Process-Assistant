import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { generateVideoScript } from '../services/geminiService';
import { Platform } from '../types';

const ScriptWriter: React.FC = () => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    platform: Platform.TIKTOK,
    topic: '',
    targetAudience: '',
    tone: '幽默搞笑 & 接地气',
    durationSeconds: 30
  });
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    if (!formData.topic) return;
    setLoading(true);
    setStep(2);
    try {
      const result = await generateVideoScript(formData);
      setScript(result);
    } catch (e) {
      console.error(e);
      setScript("生成脚本时出错，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setScript('');
  };

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white">脚本创作工坊</h2>
        <p className="text-gray-400">算法驱动的脚本写作，最大化完播率与互动</p>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Input Panel */}
        <div className={`flex-1 flex flex-col bg-dark-800 rounded-2xl border border-dark-700 p-6 overflow-y-auto transition-all duration-300 ${step === 2 ? 'hidden md:flex md:w-1/3 md:flex-none' : 'w-full'}`}>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">发布平台</label>
              <div className="grid grid-cols-2 gap-2">
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

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">视频主题</label>
              <textarea
                value={formData.topic}
                onChange={(e) => handleChange('topic', e.target.value)}
                placeholder="例如：新手如何使用 Gemini API..."
                className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500 h-24 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">目标受众</label>
              <input
                type="text"
                value={formData.targetAudience}
                onChange={(e) => handleChange('targetAudience', e.target.value)}
                placeholder="例如：Z世代学生、职场新人、宝妈"
                className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">预计时长</label>
                <select
                  value={formData.durationSeconds}
                  onChange={(e) => handleChange('durationSeconds', Number(e.target.value))}
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500"
                >
                  <option value={15}>15 秒 (短平快)</option>
                  <option value={30}>30 秒 (标准)</option>
                  <option value={60}>60 秒 (长视频)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading || !formData.topic}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '正在撰写脚本...' : '✨ 生成爆款脚本'}
            </button>
          </div>
        </div>

        {/* Output Panel */}
        {(step === 2 || loading) && (
          <div className="flex-1 bg-dark-900 rounded-2xl border border-dark-800 p-8 overflow-y-auto animate-fade-in relative">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                 <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                 <p className="text-gray-400 animate-pulse">正在设计黄金前3秒...</p>
                 <p className="text-gray-500 text-sm">正在构思分镜画面...</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xl font-bold text-white">生成的脚本</h3>
                   <div className="flex gap-2">
                     <button onClick={handleReset} className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded border border-dark-600 hover:bg-dark-800">新脚本</button>
                     <button onClick={() => navigator.clipboard.writeText(script)} className="text-sm bg-brand-600/20 text-brand-300 hover:bg-brand-600/30 px-3 py-1 rounded border border-brand-600/30">复制</button>
                   </div>
                </div>
                <div className="prose prose-invert prose-brand max-w-none">
                  <ReactMarkdown>{script}</ReactMarkdown>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScriptWriter;