import React from 'react';
import { Bell, Calendar, ChevronRight, Clock, Coffee, CreditCard, Gift, Home, MoreHorizontal, Trophy, User } from 'lucide-react';

export function Frosted() {
  return (
    <div style={{ width: 390, height: 844, overflow: 'hidden', position: 'relative', fontFamily: "'Montserrat', sans-serif" }} className="bg-gradient-to-br from-[#EBF4FA] via-white to-[#DCE9F5] text-[#0A1628]">
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      
      {/* Soft gradient orbs for frosted glass to blur over */}
      <div className="absolute top-[-50px] left-[-50px] w-[250px] h-[250px] bg-[#0047AB] rounded-full mix-blend-multiply filter blur-[100px] opacity-10 pointer-events-none"></div>
      <div className="absolute top-[300px] right-[-100px] w-[300px] h-[300px] bg-[#D4A843] rounded-full mix-blend-multiply filter blur-[120px] opacity-10 pointer-events-none"></div>
      <div className="absolute bottom-[-100px] left-[50px] w-[300px] h-[300px] bg-[#0047AB] rounded-full mix-blend-multiply filter blur-[120px] opacity-10 pointer-events-none"></div>

      <div className="h-full w-full overflow-y-auto pb-[100px] scrollbar-hide relative z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-14 pb-4 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur-xl border border-white/40 shadow-sm flex items-center justify-center font-bold text-[#0047AB] text-lg">
              147
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/60 backdrop-blur-xl border border-white/40 shadow-sm flex items-center justify-center relative">
              <Bell size={20} className="text-[#132742]" />
              <div className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-[#D4A843]"></div>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0047AB] to-[#132742] p-[2px] shadow-sm">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                <User size={20} className="text-gray-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 space-y-6">
          
          {/* Points Pill */}
          <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-full py-2.5 px-4 shadow-[0_8px_32px_rgba(0,0,0,0.04)] flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#D4A843]/20 flex items-center justify-center">
                <Trophy size={14} className="text-[#D4A843]" />
              </div>
              <span className="font-semibold text-sm text-[#132742]">Gold Member</span>
            </div>
            <div className="text-sm font-bold text-[#0047AB]">
              1,240 <span className="text-gray-500 font-medium text-xs">pts</span>
            </div>
          </div>

          {/* Live Sports Card */}
          <div className="bg-white/50 backdrop-blur-2xl border border-white/60 rounded-3xl p-5 shadow-[0_12px_40px_rgba(0,71,171,0.06)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl"></div>
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="text-xs font-bold tracking-wider text-gray-500">WORLD CUP 2026</div>
              <div className="bg-red-500/10 text-red-600 px-2 py-1 rounded text-[10px] font-bold tracking-widest flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                LIVE
              </div>
            </div>
            <div className="flex items-center justify-between relative z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-xl border border-gray-100">🏴󠁧󠁢󠁥󠁮󠁧󠁿</div>
                <div className="font-bold text-sm">ENG</div>
              </div>
              <div className="flex flex-col items-center px-4">
                <div className="text-3xl font-black text-[#0A1628] tracking-tighter">2 - 1</div>
                <div className="text-xs font-medium text-[#0047AB] mt-1">74'</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-xl border border-gray-100">🇫🇷</div>
                <div className="font-bold text-sm">FRA</div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-6 px-6">
            {[
              { icon: Calendar, label: "Book Table", active: true },
              { icon: Coffee, label: "Order Food", active: false },
              { icon: Gift, label: "Loyalty", active: false },
              { icon: CreditCard, label: "Offers", active: false }
            ].map((action, i) => (
              <div key={i} className={`flex-shrink-0 flex flex-col items-center gap-2 ${i === 0 ? '' : ''}`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm backdrop-blur-xl border transition-all ${
                  action.active 
                  ? 'bg-[#0047AB] border-[#0047AB] text-white shadow-[0_8px_20px_rgba(0,71,171,0.25)]' 
                  : 'bg-white/60 border-white/80 text-[#132742]'
                }`}>
                  <action.icon size={24} className={action.active ? "text-white" : "text-[#0047AB]"} />
                </div>
                <span className="text-[11px] font-semibold text-[#132742]">{action.label}</span>
              </div>
            ))}
          </div>

          {/* Promotional Banner */}
          <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.04)] h-48 relative group">
            <img src="/__mockup/images/promo.png" alt="Promo" className="w-full h-full object-cover mix-blend-overlay opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#132742]/90 to-transparent p-6 flex flex-col justify-end">
              <h3 className="text-white font-bold text-xl leading-tight mb-2">Friday Night<br/>Tournament</h3>
              <p className="text-white/80 text-xs mb-4 max-w-[180px]">Join our weekly amateur tournament. £500 prize pool.</p>
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                <ChevronRight size={16} className="text-white" />
              </div>
            </div>
          </div>

          {/* Special Offers */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#132742] text-lg">Special Offers</h3>
              <button className="text-xs font-semibold text-[#0047AB]">View All</button>
            </div>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide -mx-6 px-6 pb-4">
              {[1, 2].map((i) => (
                <div key={i} className="flex-shrink-0 w-64 bg-white/50 backdrop-blur-xl border border-white/60 rounded-3xl p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
                  <div className="h-32 rounded-2xl bg-gray-200 overflow-hidden relative mb-3">
                    <img src="/__mockup/images/offer.png" alt="Offer" className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-[#0047AB]">
                      SAVE 20%
                    </div>
                  </div>
                  <div className="px-2 pb-2">
                    <h4 className="font-bold text-sm text-[#132742] mb-1">Burger & Pint Combo</h4>
                    <p className="text-xs text-gray-500 font-medium">Valid until 6 PM today</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Tab Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/70 backdrop-blur-2xl border-t border-white/50 pb-8 pt-4 px-6 z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between">
          {[
            { icon: Home, label: "Home", active: true },
            { icon: Calendar, label: "Book", active: false },
            { icon: Coffee, label: "Order", active: false },
            { icon: Trophy, label: "Loyalty", active: false },
            { icon: MoreHorizontal, label: "More", active: false }
          ].map((tab, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <tab.icon size={22} className={tab.active ? "text-[#D4A843]" : "text-gray-400"} />
              <span className={`text-[10px] font-semibold ${tab.active ? "text-[#D4A843]" : "text-gray-400"}`}>
                {tab.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      
    </div>
  );
}

export default Frosted;
