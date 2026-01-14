import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatWithAssistant } from '../services/geminiService';
import { GenerateContentResponse } from '@google/genai';

const STORAGE_KEY_ASSISTANT = 'viralflow_assistant_history';

const AssistantChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load history
    const saved = localStorage.getItem(STORAGE_KEY_ASSISTANT);
    if (saved) {
        try {
            setMessages(JSON.parse(saved));
        } catch(e) { console.error(e) }
    } else {
        setMessages([{ role: 'model', text: '你好！我是你的创作助手。无论是缺灵感还是想了解算法机制，随时问我！' }]);
    }
  }, []);

  useEffect(() => {
    // Save history
    if (messages.length > 0) {
        localStorage.setItem(STORAGE_KEY_ASSISTANT, JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      // Prepare history for API (convert local format to API format)
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const resultStream = await chatWithAssistant(history, userMsg);
      
      let fullResponse = "";
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      for await (const chunk of resultStream) {
        const c = chunk as GenerateContentResponse;
        const textChunk = c.text || "";
        fullResponse += textChunk;
        
        setMessages(prev => {
          const newHistory = [...prev];
          const lastMsg = newHistory[newHistory.length - 1];
          if (lastMsg.role === 'model') {
            lastMsg.text = fullResponse;
          }
          return newHistory;
        });
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'model', text: "抱歉，我连接创作大脑时遇到了一点问题。" }]);
    } finally {
      setIsTyping(false);
    }
  };

  const clearChat = () => {
      setMessages([{ role: 'model', text: '你好！我是你的创作助手。无论是缺灵感还是想了解算法机制，随时问我！' }]);
      localStorage.removeItem(STORAGE_KEY_ASSISTANT);
  };

  return (
    <>
      {/* Floating Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 p-4 rounded-full shadow-2xl z-50 transition-all duration-300 ${
          isOpen ? 'bg-red-500 rotate-45' : 'bg-brand-600 hover:scale-110'
        }`}
      >
        <span className="text-2xl text-white">{isOpen ? '＋' : '💬'}</span>
      </button>

      {/* Chat Window */}
      <div className={`fixed bottom-24 right-6 w-80 md:w-96 bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl z-40 transition-all duration-300 origin-bottom-right flex flex-col overflow-hidden ${
        isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'
      }`} style={{ height: '500px' }}>
        
        {/* Header */}
        <div className="bg-dark-800 p-4 border-b border-dark-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                AI
            </div>
            <div>
                <h3 className="font-bold text-white text-sm">创作助手</h3>
                <p className="text-xs text-gray-400">在线</p>
            </div>
          </div>
          <button onClick={clearChat} title="重新开始" className="text-gray-400 hover:text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-dark-900/95" ref={scrollRef}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                msg.role === 'user' 
                  ? 'bg-brand-600 text-white rounded-br-none' 
                  : 'bg-dark-800 text-gray-200 rounded-bl-none border border-dark-700'
              }`}>
                 <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
              </div>
            </div>
          ))}
          {isTyping && (
             <div className="flex justify-start">
               <div className="bg-dark-800 rounded-2xl rounded-bl-none px-4 py-3 border border-dark-700">
                 <div className="flex gap-1">
                   <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                   <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75"></div>
                   <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></div>
                 </div>
               </div>
             </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 bg-dark-800 border-t border-dark-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="输入你的问题..."
              className="flex-1 bg-dark-950 border border-dark-700 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-9 h-9 bg-brand-600 rounded-full flex items-center justify-center text-white hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AssistantChat;