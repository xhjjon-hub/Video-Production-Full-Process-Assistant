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
    tone: 'Funny & Relatable',
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
      setScript("Error generating script. Please try again.");
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
        <h2 className="text-3xl font-bold text-white">Script Studio</h2>
        <p className="text-gray-400">Algorithmic script writing for maximum engagement</p>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Input Panel */}
        <div className={`flex-1 flex flex-col bg-dark-800 rounded-2xl border border-dark-700 p-6 overflow-y-auto transition-all duration-300 ${step === 2 ? 'hidden md:flex md:w-1/3 md:flex-none' : 'w-full'}`}>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Platform</label>
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
              <label className="block text-sm font-medium text-gray-400 mb-2">Video Topic</label>
              <textarea
                value={formData.topic}
                onChange={(e) => handleChange('topic', e.target.value)}
                placeholder="e.g. How to use Gemini API for beginners..."
                className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500 h-24 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Target Audience</label>
              <input
                type="text"
                value={formData.targetAudience}
                onChange={(e) => handleChange('targetAudience', e.target.value)}
                placeholder="e.g. Gen Z students, busy moms, tech professionals"
                className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Tone</label>
                <select
                  value={formData.tone}
                  onChange={(e) => handleChange('tone', e.target.value)}
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500"
                >
                  <option>Funny & Relatable</option>
                  <option>Professional & Educational</option>
                  <option>High Energy & Hype</option>
                  <option>Calm & Aesthetic</option>
                  <option>Controversial & Debatable</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Duration</label>
                <select
                  value={formData.durationSeconds}
                  onChange={(e) => handleChange('durationSeconds', Number(e.target.value))}
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-brand-500"
                >
                  <option value={15}>15 Seconds (Short)</option>
                  <option value={30}>30 Seconds (Standard)</option>
                  <option value={60}>60 Seconds (Long)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading || !formData.topic}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Writing Script...' : '✨ Create Viral Script'}
            </button>
          </div>
        </div>

        {/* Output Panel */}
        {(step === 2 || loading) && (
          <div className="flex-1 bg-dark-900 rounded-2xl border border-dark-800 p-8 overflow-y-auto animate-fade-in relative">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                 <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                 <p className="text-gray-400 animate-pulse">Designing hook strategy...</p>
                 <p className="text-gray-500 text-sm">Crafting visual cues...</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xl font-bold text-white">Generated Script</h3>
                   <div className="flex gap-2">
                     <button onClick={handleReset} className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded border border-dark-600 hover:bg-dark-800">New Script</button>
                     <button onClick={() => navigator.clipboard.writeText(script)} className="text-sm bg-brand-600/20 text-brand-300 hover:bg-brand-600/30 px-3 py-1 rounded border border-brand-600/30">Copy</button>
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