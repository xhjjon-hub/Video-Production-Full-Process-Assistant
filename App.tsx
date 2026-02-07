
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopicFinder from './components/TopicFinder';
import ScriptWriter from './components/ScriptWriter';
import MediaAnalyzer from './components/MediaAnalyzer';
import BenchmarkStudio from './components/BenchmarkStudio';
import VideoProducer from './components/VideoProducer';
import AssistantChat from './components/AssistantChat';
import { PromptManager } from './components/PromptLibrary';
import { AppView, ScriptParams } from './types';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.TOPIC_RESEARCH);
  const [showPromptManager, setShowPromptManager] = useState(false);
  const [initialScriptParams, setInitialScriptParams] = useState<Partial<ScriptParams> | null>(null);
  const [producedScript, setProducedScript] = useState<string>('');

  const getViewTitle = (view: AppView) => {
    switch (view) {
      case AppView.TOPIC_RESEARCH: return '灵感与选题';
      case AppView.SCRIPT_WRITER: return '脚本创作';
      case AppView.VIDEO_PRODUCTION: return '视频制作';
      case AppView.CONTENT_AUDIT: return '内容诊断';
      case AppView.BENCHMARK_STUDIO: return '爆款仿写';
      default: return view.replace('_', ' ');
    }
  };

  const handleNavigateToScriptWriter = (params: Partial<ScriptParams>) => {
    setInitialScriptParams(params);
    setCurrentView(AppView.SCRIPT_WRITER);
  };

  const handleNavigateToVideoProducer = (script: string) => {
    setProducedScript(script);
    setCurrentView(AppView.VIDEO_PRODUCTION);
  };

  return (
    <div className="flex h-screen w-full bg-dark-950 text-white overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar 
        currentView={currentView} 
        onChangeView={setCurrentView} 
        onOpenPromptManager={() => setShowPromptManager(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto relative custom-scrollbar">
        <div className="max-w-7xl mx-auto p-6 lg:p-10 min-h-full flex flex-col">
          {/* Header Area */}
          <div className="mb-6 flex items-center justify-between shrink-0">
             <div className="text-sm text-gray-500 uppercase tracking-wider font-semibold">
               {getViewTitle(currentView)}
             </div>
             <div className="w-8 h-8 rounded-full bg-dark-800 border border-dark-700"></div>
          </div>

          <div className="flex-1 flex flex-col">
            {currentView === AppView.TOPIC_RESEARCH && (
              <TopicFinder onNavigateToScript={handleNavigateToScriptWriter} />
            )}
            {currentView === AppView.SCRIPT_WRITER && (
              <ScriptWriter 
                initialParams={initialScriptParams} 
                onNavigateToVideoProducer={handleNavigateToVideoProducer}
              />
            )}
            {currentView === AppView.VIDEO_PRODUCTION && (
              <VideoProducer initialScript={producedScript} />
            )}
            {currentView === AppView.CONTENT_AUDIT && <MediaAnalyzer />}
            {currentView === AppView.BENCHMARK_STUDIO && <BenchmarkStudio />}
          </div>
        </div>
      </main>

      {/* Global Features */}
      <AssistantChat />
      
      {/* Modal Layer */}
      {showPromptManager && <PromptManager onClose={() => setShowPromptManager(false)} />}
    </div>
  );
};

export default App;
