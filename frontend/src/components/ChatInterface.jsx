import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Send, User, Bot, Loader2, X, Activity, ChevronLeft, Sparkles, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = 'http://localhost:8000/api';

const ChatInterface = () => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState(localStorage.getItem(`thread_id_${appointmentId}`) || '');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          thread_id: threadId,
          appointment_id: appointmentId !== 'new' ? appointmentId : null
        })
      });

      if (!response.ok) throw new Error('Network response was not ok');

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let isDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              isDone = true;
              continue;
            }

            try {
              const data = JSON.parse(dataStr);
              if (data.thread_id && !threadId) {
                setThreadId(data.thread_id);
                localStorage.setItem(`thread_id_${appointmentId}`, data.thread_id);
              }
              if (data.chunk) {
                fullResponse += data.chunk;
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastMsg = newMessages[newMessages.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant') {
                    lastMsg.content = fullResponse;
                  }
                  return newMessages;
                });
              }
            } catch (err) {
              console.error('Error parsing stream data:', err);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'error', content: 'Failed to get response. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full min-h-0 flex-1 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
        >
          <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span>Back</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-[#050505] flex items-center justify-center">
              <Bot size={14} className="text-white" />
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-[#050505] flex items-center justify-center">
              <User size={14} className="text-slate-400" />
            </div>
          </div>
          <div className="text-xs font-medium">
            <span className="text-slate-500">Session with </span>
            <span className="text-white">AI Assistant</span>
          </div>
        </div>
        <button
          onClick={() => navigate(`/voice/${appointmentId}`)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-full transition-colors shadow-lg shadow-emerald-900/30"
        >
          <Phone size={13} />
          Voice
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto pr-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center h-full text-center space-y-6"
            >
              <div className="p-8 rounded-[3rem] bg-gradient-to-br from-blue-600/10 to-violet-600/10 border border-blue-500/20 shadow-2xl relative group">
                <Sparkles size={48} className="text-blue-500 animate-pulse" />
                <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full opacity-20 group-hover:opacity-40 transition-opacity" />
              </div>
              <div className="max-w-sm">
                <h3 className="text-2xl font-bold text-white mb-3">Clinical Intelligence</h3>
                <p className="text-slate-400 leading-relaxed">
                  I'm here to assist with clinical intake
                </p>
              </div>
              
            </motion.div>
          )}
          
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`flex max-w-[85%] items-start space-x-4 p-5 rounded-[2rem] ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/20 rounded-tr-none'
                    : msg.role === 'error'
                    ? 'bg-red-900/20 border border-red-500/30 text-red-200'
                    : 'bg-[#0a0a0a] border border-slate-800 text-slate-200 rounded-tl-none backdrop-blur-sm'
                }`}
              >
                <div className={`mt-1 flex-shrink-0 p-2 rounded-xl ${msg.role === 'user' ? 'bg-white/10' : 'bg-blue-600/10 text-blue-500'}`}>
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className="flex-1">
                  <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">{msg.content}</div>
                </div>
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-[#0a0a0a] border border-slate-800 text-slate-500 p-5 rounded-[2rem] rounded-tl-none flex items-center space-x-4 backdrop-blur-sm">
                <div className="flex gap-1">
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest">Processing</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="mt-8 pt-6 border-t border-slate-800/50">
        <form onSubmit={handleSend} className="relative group">
          <div className="absolute inset-0 bg-blue-600/5 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe symptoms or ask clinical questions..."
            className="w-full bg-[#0a0a0a] border border-slate-800 rounded-[2rem] px-8 py-5 pr-20 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all text-white placeholder-slate-600 backdrop-blur-xl relative z-10"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-800 transition-all shadow-lg shadow-blue-900/40 z-20 group"
          >
            <Send size={20} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </form>
        
      </div>
    </div>
  );
};

export default ChatInterface;
