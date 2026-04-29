import React, { useState } from 'react';
import axios from 'axios';
import { Phone, PhoneCall, X, Hash, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = 'http://localhost:8000/api';

const Dialer = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [calling, setCalling] = useState(false);
  const [status, setStatus] = useState(null);
  const [isError, setIsError] = useState(false);

  const handleDial = async () => {
    if (!phoneNumber) return;
    setCalling(true);
    setIsError(false);
    setStatus('Initiating call...');
    try {
      const response = await axios.post(`${API_URL}/twilio/call`, {
        to_number: phoneNumber
      });
      const sid = response.data?.call_sid;
      setStatus(sid ? `Call initiated! SID: ${sid.slice(0, 8)}...` : 'Call initiated!');
      setPhoneNumber('');
    } catch (error) {
      console.error('Error making call:', error);
      setIsError(true);
      const errorMsg = error.response?.data?.error || 'Failed to make call. Check console.';
      setStatus(`Error: ${errorMsg}`);
    } finally {
      setCalling(false);
      setTimeout(() => {
        setStatus(null);
        setIsError(false);
      }, 8000);
    }
  };

  const addDigit = (digit) => {
    setPhoneNumber(prev => prev + digit);
  };

  const clearLast = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  const keypad = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    '*', '0', '#'
  ];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center space-y-8 max-w-md mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Smart Dialer</h1>
        <p className="text-slate-500">Connect the AI assistant to any phone number</p>
      </div>

      <div className="w-full bg-[#0a0a0a] border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl shadow-blue-900/10 backdrop-blur-xl">
        {/* Display */}
        <div className="mb-8 relative">
          <input 
            type="text" 
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1234567890"
            className="w-full bg-transparent border-b-2 border-slate-800 py-4 text-3xl font-mono text-center text-white focus:outline-none focus:border-blue-500 transition-all placeholder-slate-800"
          />
          {phoneNumber && (
            <button 
              onClick={clearLast}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          )}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {keypad.map((digit) => (
            <motion.button
              key={digit}
              whileTap={{ scale: 0.9 }}
              onClick={() => addDigit(digit)}
              className="h-16 rounded-2xl bg-slate-900/50 border border-slate-800 text-xl font-medium text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-600 transition-all flex items-center justify-center"
            >
              {digit}
            </motion.button>
          ))}
        </div>

        {/* Call Button */}
        <motion.button
          disabled={calling || !phoneNumber}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleDial}
          className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-lg shadow-lg transition-all ${
            calling || !phoneNumber 
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-900/20 hover:shadow-emerald-900/40'
          }`}
        >
          {calling ? (
            <RefreshCw className="animate-spin" size={24} />
          ) : (
            <PhoneCall size={24} />
          )}
          {calling ? 'DIALING...' : 'CALL NOW'}
        </motion.button>
      </div>

      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`px-6 py-3 rounded-full border text-sm font-medium ${
              isError 
                ? 'bg-rose-600/10 border-rose-500/20 text-rose-400' 
                : 'bg-blue-600/10 border-blue-500/20 text-blue-400'
            }`}
          >
            {status}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 text-slate-600 text-xs uppercase tracking-widest font-bold">
        <Hash size={14} />
        <span>Connected to Twilio Network</span>
      </div>
    </div>
  );
};

export default Dialer;
