import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, User, ChevronRight, Search, Filter, Plus, RefreshCw, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = 'http://localhost:8000/api';

const Appointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/appointments/`);
      setAppointments(response.data);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  const filteredAppointments = appointments.filter(app => 
    app.patient_name.toLowerCase().includes(search.toLowerCase())
  );

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
          <h1 className="text-3xl font-bold text-white">Appointments</h1>
          <p className="text-slate-500 mt-1">Manage and monitor patient intake sessions</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchAppointments}
            className={`p-3 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-all ${loading ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={20} className="text-slate-400" />
          </button>
          
        </div>
      </div>

      {/* Filters & Stats */}
      <div className="grid grid-cols-1  gap-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
          <input 
            type="text" 
            placeholder="Search patients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-slate-800 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white placeholder-slate-600"
          />
        </div>
       
      </div>

      {/* Appointment Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-[#0a0a0a] border border-slate-800 rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <AnimatePresence>
            {filteredAppointments.map((app) => (
              <motion.div
                key={app.id}
                variants={itemVariants}
                layout
                whileHover={{ y: -4, borderColor: 'rgba(59, 130, 246, 0.4)' }}
                className="bg-[#0a0a0a]/50 border border-slate-800 rounded-3xl p-6 transition-all group cursor-pointer hover:bg-slate-800/30 backdrop-blur-sm"
                onClick={() => navigate(`/appointment/${app.id}`)}
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 rounded-2xl bg-blue-600/10 text-blue-500">
                    <User size={24} />
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    app.status === 'booked' ? 'border-green-500/50 text-green-500 bg-green-500/5' : 
                    app.status === 'cancelled' ? 'border-red-500/50 text-red-500 bg-red-500/5' : 
                    'border-slate-500/50 text-slate-500'
                  }`}>
                    {app.status}
                  </span>
                </div>
                
                <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors mb-4 truncate">
                  {app.patient_name}
                </h3>

                <div className="space-y-3 text-sm text-slate-400">
                  <div className="flex items-center gap-3">
                    <Calendar size={16} className="text-slate-500" />
                    <span>{new Date(app.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock size={16} className="text-slate-500" />
                    <span>{app.time.slice(0, 5)}</span>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/chat/${app.id}`);
                      }}
                      className="text-xs font-bold text-blue-500 hover:text-blue-400 transition-colors"
                    >
                      TEXT
                    </button>
                    <span className="text-slate-700">|</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/voice/${app.id}`);
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
                    >
                      <Phone size={11} />
                      VOICE
                    </button>
                  </div>
                  <ChevronRight size={18} className="text-slate-600 group-hover:text-white transition-colors" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {!loading && filteredAppointments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
          <Calendar size={64} className="mb-4 text-slate-700" />
          <h3 className="text-xl font-medium">No appointments found</h3>
          <p className="text-slate-500 max-w-xs mx-auto mt-2">Try adjusting your search or add a new appointment to get started.</p>
        </div>
      )}
    </div>
  );
};

export default Appointments;
