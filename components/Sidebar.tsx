
import React from 'react';
import { AppView } from '../types';

interface SidebarProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
  const navItems = [
    { id: AppView.TOPIC_RESEARCH, label: '💡 灵感与选题', icon: '🔍' },
    { id: AppView.SCRIPT_WRITER, label: '📝 脚本创作', icon: '✍️' },
    { id: AppView.CONTENT_AUDIT, label: '🎬 内容诊断', icon: '🩺' },
    { id: AppView.BENCHMARK_STUDIO, label: '🧬 爆款仿写', icon: '👯' },
  ];

  return (
    <div className="w-64 bg-dark-900 border-r border-dark-800 flex flex-col h-full sticky top-0">
      <div className="p-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-brand-400 to-blue-500 bg-clip-text text-transparent">
          ViralFlow
        </h1>
        <p className="text-xs text-gray-400 mt-1">AI 创作工坊</p>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onChangeView(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              currentView === item.id
                ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30'
                : 'text-gray-400 hover:bg-dark-800 hover:text-white'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="font-medium text-sm">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-dark-800">
        <div className="bg-dark-800 rounded-lg p-3">
          <p className="text-xs text-gray-400 text-center">由 Gemini 3.0 驱动</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
