
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopicFinder from './components/TopicFinder';
import ScriptWriter from './components/ScriptWriter';
import MediaAnalyzer from './components/MediaAnalyzer';
import BenchmarkStudio from './components/BenchmarkStudio';
import AssistantChat from './components/AssistantChat';
import { AppView } from './types';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.TOPIC_RESEARCH);

  const getViewTitle = (view: AppView) => {
    switch (view) {
      case AppView.TOPIC_RESEARCH: return '灵感与选题';
      case AppView.SCRIPT_WRITER: return '脚本创作';
      case AppView.CONTENT_AUDIT: return '内容诊断';
      case AppView.BENCHMARK_STUDIO: return '爆款仿写';
      default: return view.replace('_', ' ');
    }
  };

  return (
    <div className="flex h-screen w-full bg-dark-950 text-white overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar currentView={currentView} onChangeView={setCurrentView} />

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto relative">
        <div className="max-w-7xl mx-auto p-6 lg:p-10 min-h-full">
          {/* Header Area (Optional breadcrumb/title per page) */}
          <div className="mb-2 flex items-center justify-between">
             <div className="text-sm text-gray-500 uppercase tracking-wider font-semibold">
               {getViewTitle(currentView)}
             </div>
             {/* Example Profile/Settings Placeholder */}
             <div className="w-8 h-8 rounded-full bg-dark-800 border border-dark-700"></div>
          </div>

          <div className="mt-4 h-[calc(100%-3rem)]">
            {currentView === AppView.TOPIC_RESEARCH && <TopicFinder />}
            {currentView === AppView.SCRIPT_WRITER && <ScriptWriter />}
            {currentView === AppView.CONTENT_AUDIT && <MediaAnalyzer />}
            {currentView === AppView.BENCHMARK_STUDIO && <BenchmarkStudio />}
          </div>
        </div>
      </main>

      {/* Global Features */}
      <AssistantChat />
    </div>
  );
};

export default App;
