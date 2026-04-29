import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Phone, Clock, Calendar, RefreshCw, Hash, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = 'http://localhost:8000/api';

const CallLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/twilio/logs`);
      setLogs(response.data);
    } catch (error) {
      console.error('Error fetching call logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <div className="w-full space-y-8 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Call Logs</h1>
          <p className="text-slate-500 mt-1">History of inbound Twilio phone calls</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchLogs}
            className={`p-3 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-all ${loading ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={20} className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* Call Logs Table/List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-[#0a0a0a] border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          <AnimatePresence>
            {logs.map((log) => (
              <motion.div
                key={log.id}
                variants={itemVariants}
                layout
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                className={`bg-[#0a0a0a]/50 border border-slate-800 rounded-2xl p-5 transition-all group hover:bg-slate-800/30 backdrop-blur-sm flex flex-col justify-between gap-4 cursor-pointer ${
                  expandedLog === log.id ? 'border-blue-500/40 bg-slate-800/40' : ''
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${log.status === 'in-progress' ? 'bg-blue-600/10 text-blue-500' : 'bg-slate-800 text-slate-400'}`}>
                      <Phone size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">{log.from_number || 'Unknown'}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          log.status === 'in-progress' ? 'border-blue-500/50 text-blue-500 bg-blue-500/5' : 'border-slate-600 text-slate-500'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          <span>{new Date(log.start_time).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          <span>{new Date(log.start_time).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="hidden lg:flex flex-col items-end">
                      <span className="text-slate-500 text-[10px] uppercase font-bold tracking-tighter">Call SID</span>
                      <span className="text-slate-400 font-mono text-xs">{log.call_sid.slice(0, 12)}...</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-slate-500 text-[10px] uppercase font-bold tracking-tighter">To Number</span>
                      <span className="text-slate-300">{log.to_number || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedLog === log.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4 border-t border-slate-800 mt-2">
                        <div className="flex items-center gap-2 mb-3 text-blue-400">
                          <Hash size={14} />
                          <span className="text-xs font-bold uppercase tracking-widest">Call Transcript</span>
                        </div>
                        <div className="bg-black/40 rounded-xl p-4 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                          {log.transcript ? (
                            <div className="space-y-3">
                              {log.transcript.split('\n').map((line, idx) => {
                                const isAI = line.startsWith('AI:');
                                const content = line.replace(/^(AI:|User:)\s*/, '');
                                return (
                                  <div key={idx} className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                                      isAI 
                                        ? 'bg-slate-800 text-slate-200 rounded-tl-none' 
                                        : 'bg-blue-600 text-white rounded-tr-none'
                                    }`}>
                                      <div className="text-[10px] opacity-50 mb-1 font-bold">
                                        {isAI ? 'ASSISTANT' : 'USER'}
                                      </div>
                                      {content}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-slate-500 text-sm italic py-4 text-center">
                              No transcript available for this call.
                            </div>
                          )}
                        </div>
                        
                        {log.summary && (
                          <div className="mt-4">
                            <div className="flex items-center gap-2 mb-2 text-emerald-400">
                              <User size={14} />
                              <span className="text-xs font-bold uppercase tracking-widest">Call Summary</span>
                            </div>
                            <p className="text-slate-400 text-sm bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
                              {log.summary}
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {!loading && logs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
          <Phone size={64} className="mb-4 text-slate-700" />
          <h3 className="text-xl font-medium">No call logs found</h3>
          <p className="text-slate-500 max-w-xs mx-auto mt-2">Inbound calls will appear here once they are received.</p>
        </div>
      )}
    </div>
  );
};

export default CallLogs;
