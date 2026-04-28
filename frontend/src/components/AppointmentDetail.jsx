import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  ArrowLeft, 
  Activity, 
  Clock, 
  ShieldCheck, 
  Stethoscope, 
  FileText, 
  Calendar, 
  MessageSquare,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

const API_URL = 'http://localhost:8000/api';

const AppointmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBrief = async () => {
      try {
        const response = await axios.get(`${API_URL}/appointments/${id}/brief`);
        setBrief(response.data);
      } catch (err) {
        console.error('Error fetching clinical brief:', err);
        setError(err.response?.data?.detail || 'Clinical brief not found for this appointment.');
      } finally {
        setLoading(false);
      }
    };
    fetchBrief();
  }, [id]);

  const handleExport = async () => {
    try {
      const response = await axios.get(`${API_URL}/appointments/${id}/export`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Clinical_Report_${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export report. Please ensure the clinical brief exists.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <Loader2 className="animate-spin text-blue-500" size={48} />
        <p className="text-slate-400 font-medium animate-pulse">Analyzing clinical records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span>Back to Dashboard</span>
        </button>
        <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-12 text-center">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Notice</h2>
          <p className="text-slate-400 max-w-md mx-auto mb-8">{error}</p>
          <button 
            onClick={() => navigate(`/chat/${id}`)}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-all"
          >
            Start Intake Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-20 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
      {/* Header */}
      <div className="flex items-center justify-between mb-12">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span>Back to Dashboard</span>
        </button>
        <div className="flex gap-4">
          <button 
            onClick={() => navigate(`/chat/${id}`)}
            className="flex items-center gap-2 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 transition-all font-medium"
          >
            <MessageSquare size={18} />
            <span>Open Chat</span>
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all font-medium"
          >
            <FileText size={18} />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-10"
      >
        {/* Title Section */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="px-3 py-1 rounded-full bg-blue-600/10 text-blue-500 text-[10px] font-bold uppercase tracking-widest border border-blue-500/20">
                Generated Report
              </div>
              <span className="text-slate-500 text-sm">{new Date(brief.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <h1 className="text-4xl font-extrabold text-white tracking-tight">Clinical Briefing</h1>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-4">
            <Stethoscope className="text-blue-500" size={32} />
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-tighter">Case Reference</p>
              <p className="text-white font-mono">#{id.padStart(6, '0')}</p>
            </div>
          </div>
        </div>

        {/* Summary Card */}
        {brief.summary && (
          <section className="relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-violet-600/5 group-hover:from-blue-600/10 group-hover:to-violet-600/10 transition-all duration-500" />
            <div className="relative bg-[#0a0a0a]/80 border border-slate-800/50 backdrop-blur-xl rounded-[2.5rem] p-10 md:p-14">
              <div className="flex items-center gap-3 text-blue-400 font-bold uppercase tracking-[0.3em] text-xs mb-8">
                <Activity size={20} className="animate-pulse" />
                <span>Executive Summary</span>
              </div>
              <p className="text-2xl md:text-3xl font-medium text-slate-100 leading-tight md:leading-relaxed">
                {brief.summary}
              </p>
              <div className="mt-8 flex items-center gap-2 text-slate-500 text-sm italic">
                <ShieldCheck size={16} />
                <span>AI-generated insight based on clinical dialogue</span>
              </div>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Chief Complaint */}
          <section className="bg-[#0a0a0a]/50 border border-slate-800 rounded-3xl p-8 space-y-6">
            <div className="flex items-center gap-3 text-blue-400 font-bold uppercase tracking-widest text-xs border-b border-slate-800 pb-4">
              <Activity size={18} />
              <span>Chief Complaint</span>
            </div>
            <div className="space-y-6">
              {brief.cc.map((item, i) => (
                <div key={i} className="group">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2 group-hover:text-slate-400 transition-colors tracking-widest">Question {i + 1}</p>
                  <p className="text-slate-300 font-medium mb-3 pl-4 border-l-2 border-slate-800 group-hover:border-blue-500/50 transition-colors">{item.question}</p>
                  <p className="text-xs font-bold text-blue-500 uppercase mb-2 tracking-widest">Finding</p>
                  <p className="text-white text-lg font-bold bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>

          {/* History of Present Illness */}
          <section className="bg-[#0a0a0a]/50 border border-slate-800 rounded-3xl p-8 space-y-6">
            <div className="flex items-center gap-3 text-purple-400 font-bold uppercase tracking-widest text-xs border-b border-slate-800 pb-4">
              <Clock size={18} />
              <span>History of Present Illness</span>
            </div>
            <div className="space-y-6">
              {brief.hpi.map((item, i) => (
                <div key={i} className="group">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2 tracking-widest">Observation</p>
                  <p className="text-slate-300 font-medium mb-3 pl-4 border-l-2 border-slate-800 group-hover:border-purple-500/50 transition-colors">{item.question}</p>
                  <p className="text-xs font-bold text-purple-400 uppercase mb-2 tracking-widest">Patient Response</p>
                  <p className="text-white text-lg font-bold bg-purple-500/5 p-4 rounded-2xl border border-purple-500/10">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Review of Systems */}
        <section className="bg-[#0a0a0a]/50 border border-slate-800 rounded-3xl p-8 space-y-8">
          <div className="flex items-center gap-3 text-emerald-400 font-bold uppercase tracking-widest text-xs border-b border-slate-800 pb-4">
            <ShieldCheck size={18} />
            <span>Review of Systems</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {brief.ros.map((item, i) => {
              const isPositive = item.answer.toLowerCase().includes('yes');
              return (
                <div key={i} className={`p-6 rounded-[2rem] border transition-all ${
                  isPositive 
                    ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' 
                    : 'bg-slate-800/30 border-slate-800'
                }`}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Symptom Inquiry</p>
                  <p className="text-sm text-slate-300 mb-4 h-10 overflow-hidden line-clamp-2">{item.question}</p>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isPositive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-600'}`} />
                    <p className={`font-black text-xl ${isPositive ? 'text-white' : 'text-slate-500'}`}>{item.answer}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Footer info */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-10 border-t border-slate-800 text-slate-500 text-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Calendar size={16} />
              <span>Created {new Date(brief.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={16} />
              <span>{new Date(brief.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AppointmentDetail;
