
import React, { useState, useEffect, useRef } from 'react';
import { PromptTemplate } from '../types';

const STORAGE_KEY = 'viralflow_prompt_templates';

// --- Service Logic ---
const loadTemplates = (): PromptTemplate[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
};

const saveTemplates = (templates: PromptTemplate[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  // Dispatch a custom event to sync across components instantly
  window.dispatchEvent(new Event('prompt-templates-updated'));
};

// --- Components ---

interface PromptManagerProps {
  onClose: () => void;
}

export const PromptManager: React.FC<PromptManagerProps> = ({ onClose }) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  const handleSave = () => {
    if (!editTitle.trim() || !editContent.trim()) return;
    
    let newTemplates;
    if (editingId) {
      newTemplates = templates.map(t => t.id === editingId ? { ...t, title: editTitle, content: editContent } : t);
    } else {
      newTemplates = [...templates, { id: Date.now().toString(), title: editTitle, content: editContent }];
    }
    
    setTemplates(newTemplates);
    saveTemplates(newTemplates);
    handleCancel();
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个模版吗？')) {
      const newTemplates = templates.filter(t => t.id !== id);
      setTemplates(newTemplates);
      saveTemplates(newTemplates);
    }
  };

  const startEdit = (t?: PromptTemplate) => {
    if (t) {
      setEditingId(t.id);
      setEditTitle(t.title);
      setEditContent(t.content);
    } else {
      setEditingId(null);
      setEditTitle('');
      setEditContent('');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-dark-700 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            📚 提示词库管理
            <span className="text-xs font-normal bg-dark-800 text-gray-400 px-2 py-0.5 rounded-full">{templates.length}</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl leading-none">×</button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* List */}
          <div className="w-1/3 border-r border-dark-800 overflow-y-auto p-2 space-y-2 bg-dark-950/30">
            <button 
              onClick={() => startEdit()} 
              className="w-full py-3 border-2 border-dashed border-dark-700 text-gray-400 rounded-lg hover:border-brand-500 hover:text-brand-400 transition-all text-sm font-medium"
            >
              + 新建模版
            </button>
            {templates.map(t => (
               <div 
                 key={t.id} 
                 onClick={() => startEdit(t)}
                 className={`p-3 rounded-lg cursor-pointer text-left group transition-all ${editingId === t.id ? 'bg-brand-900/30 border border-brand-600/50' : 'bg-dark-800 border border-dark-700 hover:border-gray-600'}`}
               >
                 <div className="font-medium text-gray-200 truncate text-sm mb-1">{t.title}</div>
                 <div className="text-xs text-gray-500 line-clamp-2">{t.content}</div>
               </div>
            ))}
          </div>

          {/* Editor */}
          <div className="flex-1 p-5 flex flex-col bg-dark-900">
             <div className="mb-4">
               <label className="block text-xs font-medium text-gray-500 mb-1">模版标题</label>
               <input 
                 value={editTitle}
                 onChange={e => setEditTitle(e.target.value)}
                 placeholder="例如：小红书爆款文案风格..."
                 className="w-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:border-brand-500"
               />
             </div>
             <div className="flex-1 mb-4">
               <label className="block text-xs font-medium text-gray-500 mb-1">模版内容</label>
               <textarea 
                 value={editContent}
                 onChange={e => setEditContent(e.target.value)}
                 placeholder="输入你想重复使用的提示词..."
                 className="w-full h-full bg-dark-950 border border-dark-700 rounded-lg p-3 text-white focus:border-brand-500 resize-none font-mono text-sm"
               />
             </div>
             <div className="flex justify-end gap-3">
               {editingId && (
                 <button onClick={() => handleDelete(editingId)} className="mr-auto text-red-400 text-sm hover:text-red-300">删除</button>
               )}
               <button onClick={handleCancel} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
               <button 
                 onClick={handleSave} 
                 disabled={!editTitle.trim() || !editContent.trim()}
                 className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
               >
                 保存模版
               </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PromptPickerProps {
  onSelect: (content: string) => void;
  currentValue?: string; // Optional: Allow saving current input as template
  position?: 'top' | 'bottom';
}

export const PromptPicker: React.FC<PromptPickerProps> = ({ onSelect, currentValue, position = 'bottom' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = () => setTemplates(loadTemplates());

  useEffect(() => {
    window.addEventListener('prompt-templates-updated', load);
    // Initial load
    load(); 
    return () => window.removeEventListener('prompt-templates-updated', load);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveCurrent = () => {
    if (!currentValue?.trim()) return;
    const title = prompt("请输入模版名称：", "新模版 " + new Date().toLocaleTimeString());
    if (title) {
      const newTpls = [...templates, { id: Date.now().toString(), title, content: currentValue }];
      saveTemplates(newTpls);
      setTemplates(newTpls);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative inline-block ml-2" ref={containerRef}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-gray-400 hover:text-brand-300 transition-colors p-1.5 rounded-md hover:bg-dark-800 flex items-center gap-1"
        title="提示词模版"
      >
        <span>📖</span>
        <span className="text-xs hidden sm:inline">模版</span>
      </button>

      {isOpen && (
        <div className={`absolute ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 w-64 max-h-80 bg-dark-900 border border-dark-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-fade-in-up`}>
          <div className="p-3 bg-dark-800 border-b border-dark-700 text-xs font-bold text-gray-400">
            选择提示词
          </div>
          
          <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
            {templates.length === 0 ? (
               <div className="p-4 text-center text-xs text-gray-500">暂无模版</div>
            ) : (
               templates.map(t => (
                 <button
                   key={t.id}
                   onClick={() => { onSelect(t.content); setIsOpen(false); }}
                   className="w-full text-left p-2 hover:bg-dark-800 rounded-lg group"
                 >
                   <div className="text-sm text-gray-200 font-medium truncate group-hover:text-brand-300">{t.title}</div>
                   <div className="text-xs text-gray-500 truncate">{t.content}</div>
                 </button>
               ))
            )}
          </div>

          <div className="p-2 border-t border-dark-700 bg-dark-950/50 space-y-1">
             {currentValue && currentValue.trim().length > 0 && (
                <button 
                   onClick={handleSaveCurrent}
                   className="w-full text-xs text-left px-2 py-1.5 text-brand-400 hover:bg-dark-800 rounded transition-colors flex items-center gap-2"
                >
                   <span>＋</span> 保存当前内容为模版
                </button>
             )}
             {/* Note: Managing usually happens via sidebar, but we show user they can manage there */}
             <div className="text-[10px] text-gray-600 text-center pt-1">在侧边栏可管理所有模版</div>
          </div>
        </div>
      )}
    </div>
  );
};
