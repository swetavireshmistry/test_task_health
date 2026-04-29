import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Calendar, MessageSquare, Settings, Activity, Phone, PhoneCall } from 'lucide-react';
import { motion } from 'framer-motion';

const Layout = () => {
  const location = useLocation();

  const menuItems = [
    { icon: Calendar, label: 'Appointments', path: '/' },
    { icon: MessageSquare, label: 'Chat Assistant', path: '/chat/new' },
    { icon: Phone, label: 'Call Logs', path: '/logs' },
    { icon: PhoneCall, label: 'Smart Dialer', path: '/dialer' },
    { icon: Settings, label: 'Dr Config', path: '/dr-config' },
  ];

  return (
    <div className="flex h-screen w-full bg-[#050505] text-slate-200 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-20 lg:w-64 border-r border-slate-800/50 bg-[#0a0a0a]/80 backdrop-blur-xl flex flex-col transition-all duration-300">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
            <Activity className="text-white" size={24} />
          </div>
          <span className="hidden lg:block font-bold text-xl tracking-tight text-white">Health<span className="text-blue-500">Flow</span></span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link key={item.label} to={item.path}>
                <motion.div
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                    isActive 
                      ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' 
                      : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <item.icon size={20} className={isActive ? 'text-blue-400' : 'group-hover:text-slate-200'} />
                  <span className="hidden lg:block font-medium">{item.label}</span>
                  {isActive && (
                    <motion.div 
                      layoutId="active-pill"
                      className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                    />
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Background blobs for premium look */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/10 blur-[120px] rounded-full pointer-events-none" />
        
        <header className="h-20 border-b border-slate-800/50 flex items-center justify-between px-8 bg-[#050505]/50 backdrop-blur-sm z-10">
          <div>
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-widest">Medical Management</h2>
          </div>
          
        </header>

        <div className="flex-1 overflow-hidden flex flex-col p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
