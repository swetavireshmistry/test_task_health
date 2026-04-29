import React, { useState, useEffect } from 'react';
import { Settings, Plus, Trash2, X, Loader2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const DrConfig = () => {
    const [configs, setConfigs] = useState([]);
    const [activeTab, setActiveTab] = useState('hpi');
    const [newDisease, setNewDisease] = useState('');
    const [newQuestion, setNewQuestion] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/config/clinical');
            const data = await response.json();
            setConfigs(data);
        } catch (error) {
            console.error('Error fetching configs:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfig = async (category, scope, diseaseName = null, questions = []) => {
        try {
            const existing = configs.find(c => c.category === category && c.scope === scope && c.disease_name === diseaseName);
            const configData = {
                id: existing ? existing.id : null,
                category,
                scope,
                disease_name: diseaseName,
                questions
            };
            const response = await fetch('http://localhost:8000/api/config/clinical', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configData)
            });
            if (response.ok) fetchConfigs();
        } catch (error) {
            console.error('Error saving config:', error);
        }
    };

    const handleDeleteConfig = async (id) => {
        try {
            await fetch(`http://localhost:8000/api/config/clinical/${id}`, { method: 'DELETE' });
            fetchConfigs();
        } catch (error) {
            console.error('Error deleting config:', error);
        }
    };

    const addQuestion = (category, scope, diseaseName = null) => {
        if (!newQuestion.trim()) return;
        const existing = configs.find(c => c.category === category && c.scope === scope && c.disease_name === diseaseName);
        const questions = existing ? [...existing.questions, newQuestion] : [newQuestion];
        handleSaveConfig(category, scope, diseaseName, questions);
        setNewQuestion('');
    };

    const removeQuestion = (config, questionIndex) => {
        const questions = config.questions.filter((_, i) => i !== questionIndex);
        handleSaveConfig(config.category, config.scope, config.disease_name, questions);
    };

    const renderSection = (category) => {
        const generalConfig = configs.find(c => c.category === category && c.scope === 'all');
        const diseaseConfigs = configs.filter(c => c.category === category && c.scope === 'disease_specific');

        return (
            <div className="space-y-6">
                {/* General Questions */}
                <section className="bg-[#0a0a0a]/50 border border-slate-800 rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 text-blue-400 font-bold uppercase tracking-widest text-xs border-b border-slate-800 pb-4">
                        <Settings size={16} />
                        <span>General {category.toUpperCase()} Questions</span>
                    </div>

                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="Add a general question..."
                            className="flex-1 bg-[#050505] border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                            value={activeTab === category && !newDisease ? newQuestion : ''}
                            onChange={(e) => {
                                setNewQuestion(e.target.value);
                                setNewDisease('');
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && addQuestion(category, 'all')}
                        />
                        <button
                            onClick={() => addQuestion(category, 'all')}
                            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all"
                        >
                            <Plus size={16} />
                            <span>Add</span>
                        </button>
                    </div>

                    <ul className="space-y-2">
                        <AnimatePresence>
                            {generalConfig?.questions.map((q, i) => (
                                <motion.li
                                    key={i}
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="flex justify-between items-center bg-slate-800/30 border border-slate-800 px-5 py-3 rounded-xl group"
                                >
                                    <span className="text-slate-300 text-sm">{q}</span>
                                    <button
                                        onClick={() => removeQuestion(generalConfig, i)}
                                        className="text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all p-1 rounded-lg hover:bg-red-500/10"
                                    >
                                        <X size={14} />
                                    </button>
                                </motion.li>
                            ))}
                        </AnimatePresence>
                        {(!generalConfig || generalConfig.questions.length === 0) && (
                            <li className="text-slate-600 text-sm text-center py-4 italic">No general questions yet</li>
                        )}
                    </ul>
                </section>

                {/* Disease Specific Questions */}
                <section className="bg-[#0a0a0a]/50 border border-slate-800 rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 text-violet-400 font-bold uppercase tracking-widest text-xs border-b border-slate-800 pb-4">
                        <Settings size={16} />
                        <span>Disease-Specific {category.toUpperCase()} Questions</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Disease Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Chest Pain, Diabetes..."
                                className="w-full bg-[#050505] border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
                                value={newDisease}
                                onChange={(e) => setNewDisease(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Specific Question</label>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    placeholder="Add question for this disease..."
                                    className="flex-1 bg-[#050505] border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
                                    value={newDisease ? newQuestion : ''}
                                    onChange={(e) => setNewQuestion(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && newDisease && addQuestion(category, 'disease_specific', newDisease)}
                                />
                                <button
                                    onClick={() => newDisease && addQuestion(category, 'disease_specific', newDisease)}
                                    className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-medium transition-all"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <AnimatePresence>
                            {diseaseConfigs.map((config, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="border border-slate-800 rounded-2xl p-5 bg-slate-800/20"
                                >
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-bold text-violet-400 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
                                            {config.disease_name}
                                        </h4>
                                        <button
                                            onClick={() => handleDeleteConfig(config.id)}
                                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                                        >
                                            <Trash2 size={12} />
                                            <span>Delete Set</span>
                                        </button>
                                    </div>
                                    <ul className="space-y-2">
                                        {config.questions.map((q, i) => (
                                            <li key={i} className="flex justify-between items-center bg-[#050505] border border-slate-800 px-4 py-2.5 rounded-xl group">
                                                <span className="text-sm text-slate-400">{q}</span>
                                                <button
                                                    onClick={() => removeQuestion(config, i)}
                                                    className="text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all p-1 rounded hover:bg-red-500/10"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </li>
                                        ))}
                                        {config.questions.length === 0 && (
                                            <li className="text-slate-600 text-xs text-center py-2 italic">No questions</li>
                                        )}
                                    </ul>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {diseaseConfigs.length === 0 && (
                            <p className="text-slate-600 text-sm text-center py-4 italic">No disease-specific configurations yet</p>
                        )}
                    </div>
                </section>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
                <Loader2 className="animate-spin text-blue-500" size={48} />
                <p className="text-slate-400 font-medium animate-pulse">Loading configuration...</p>
            </div>
        );
    }

    return (
        <div className="w-full space-y-8 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Clinical Configuration</h1>
                    <p className="text-slate-500 mt-1">Define custom HPI and ROS questions for the intake assistant.</p>
                </div>
            </div>

            <div className="flex gap-1 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl w-fit">
                {['hpi', 'ros'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${activeTab === tab
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        {tab === 'hpi' ? 'HPI — History of Present Illness' : 'ROS — Review of Systems'}
                    </button>
                ))}
            </div>

            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
            >
                {renderSection(activeTab)}
            </motion.div>
        </div>
    );
};

export default DrConfig;
