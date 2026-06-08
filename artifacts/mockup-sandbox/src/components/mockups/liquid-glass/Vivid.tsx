import React from 'react';
import { Bell, User, Calendar, Coffee, Star, Tag, Home, Search, Heart, Menu } from 'lucide-react';

export function Vivid() {
  return (
    <div 
      style={{ 
        width: 390, 
        height: 844, 
        overflow: 'hidden', 
        position: 'relative', 
        fontFamily: "'Montserrat', sans-serif",
        backgroundColor: '#0A1628',
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      
      {/* Animated Background */}
      <div 
        style={{
          position: 'absolute',
          inset: -200,
          background: `
            radial-gradient(circle at 20% 10%, #0047AB 0%, transparent 40%),
            radial-gradient(circle at 80% 80%, #D4A843 0%, transparent 40%),
            radial-gradient(circle at 80% 20%, #008080 0%, transparent 40%),
            radial-gradient(circle at 20% 80%, #132742 0%, transparent 50%)
          `,
          backgroundSize: '200% 200%',
          animation: 'bgShift 15s ease infinite',
          zIndex: 0,
        }}
      />

      <style>{`
        @keyframes bgShift {
          0% { background-position: 0% 0%; }
          25% { background-position: 100% 0%; }
          50% { background-position: 100% 100%; }
          75% { background-position: 0% 100%; }
          100% { background-position: 0% 0%; }
        }
        
        .liquid-glass {
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(32px) saturate(160%);
          -webkit-backdrop-filter: blur(32px) saturate(160%);
          border-top: 1.5px solid rgba(255, 255, 255, 0.5);
          border-left: 1px solid rgba(255, 255, 255, 0.2);
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 
            inset 0 -2px 10px rgba(0, 0, 0, 0.1),
            inset 0 2px 4px rgba(255, 255, 255, 0.4),
            0 8px 32px rgba(0, 0, 0, 0.2);
        }

        .liquid-glass-pill {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-top: 1px solid rgba(255, 255, 255, 0.6);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 2px rgba(255, 255, 255, 0.4);
        }

        .text-glow {
          text-shadow: 0 2px 10px rgba(255, 255, 255, 0.3);
        }
        
        /* Hide scrollbar */
        ::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Main Content Area */}
      <div 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          zIndex: 1,
          overflowY: 'auto',
          paddingBottom: 100
        }}
      >
        {/* Header */}
        <header className="flex justify-between items-center px-6 pt-14 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full liquid-glass flex items-center justify-center">
              <span className="text-white font-bold text-lg">147</span>
            </div>
            <span className="text-white font-semibold tracking-wide text-glow">THE 147</span>
          </div>
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full liquid-glass flex items-center justify-center relative">
              <Bell size={20} color="white" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-[#D4A843] rounded-full shadow-[0_0_8px_#D4A843]"></div>
            </div>
            <div className="w-10 h-10 rounded-full liquid-glass flex items-center justify-center overflow-hidden">
              <User size={20} color="white" />
            </div>
          </div>
        </header>

        {/* Points Pill */}
        <div className="px-6 mb-6">
          <div className="liquid-glass-pill rounded-full py-2.5 px-5 flex justify-between items-center bg-gradient-to-r from-[rgba(212,168,67,0.15)] to-transparent">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#D4A843] shadow-[0_0_10px_#D4A843]"></div>
              <span className="text-white text-sm font-medium">Gold Member</span>
            </div>
            <span className="text-[#D4A843] font-bold">1,240 pts</span>
          </div>
        </div>

        {/* Live Sports Card */}
        <div className="px-6 mb-6">
          <div className="liquid-glass rounded-[28px] overflow-hidden relative min-h-[160px]">
            <img 
              src="/__mockup/images/vivid-sports.png" 
              alt="Sports"
              className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A1628]/90 via-[#0A1628]/40 to-transparent" />
            
            <div className="relative p-5 h-full flex flex-col justify-between">
              <div className="flex justify-between items-start mb-6">
                <span className="text-white/80 text-xs font-bold tracking-widest">WORLD CUP 2026</span>
                <div className="bg-[#D4A843]/20 border border-[#D4A843]/50 rounded-full px-2.5 py-1 flex items-center gap-1.5 backdrop-blur-md">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#D4A843] animate-pulse"></div>
                  <span className="text-[#D4A843] text-[10px] font-bold">LIVE</span>
                </div>
              </div>
              
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="text-white font-bold text-xl">ENG</div>
                  </div>
                  <span className="text-white/50 font-medium">VS</span>
                  <div className="text-center">
                    <div className="text-white font-bold text-xl">FRA</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[#D4A843] font-bold text-3xl leading-none">2 - 1</div>
                  <span className="text-white/60 text-xs mt-1 block">74:23</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-6 mb-8 flex gap-3 overflow-x-auto snap-x">
          {[
            { icon: Calendar, label: "Book Table" },
            { icon: Coffee, label: "Order Food" },
            { icon: Star, label: "Loyalty" },
            { icon: Tag, label: "Offers" }
          ].map((action, i) => (
            <div key={i} className="flex flex-col items-center gap-2 snap-center">
              <div className="w-16 h-16 rounded-[24px] liquid-glass-pill flex items-center justify-center active:scale-95 transition-transform">
                <action.icon size={24} color="white" className="drop-shadow-lg" />
              </div>
              <span className="text-white/80 text-xs font-medium">{action.label}</span>
            </div>
          ))}
        </div>

        {/* Promo Carousel */}
        <div className="px-6 mb-8">
          <div className="liquid-glass rounded-[28px] overflow-hidden relative h-[200px]">
            <img 
              src="/__mockup/images/vivid-promo.png" 
              alt="Promo"
              className="absolute inset-0 w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0047AB]/60 to-transparent" />
            
            <div className="relative p-6 flex flex-col justify-center h-full w-2/3">
              <h3 className="text-white text-2xl font-bold mb-2 leading-tight">Weekend Tournaments</h3>
              <p className="text-white/70 text-sm mb-4">Join the semi-pro league this Friday.</p>
              <button className="bg-white text-[#0A1628] rounded-full py-2.5 px-5 font-bold text-sm self-start shadow-lg active:scale-95 transition-transform">
                Register Now
              </button>
            </div>
          </div>
        </div>

        {/* Offers */}
        <div className="mb-8">
          <div className="px-6 mb-4 flex justify-between items-center">
            <h2 className="text-white text-lg font-bold">Special Offers</h2>
            <span className="text-[#D4A843] text-sm font-medium">See all</span>
          </div>
          <div className="flex gap-4 px-6 overflow-x-auto snap-x pb-4">
            {[
              { img: "vivid-offer1.png", title: "Burger & Pint", price: "£14.50" },
              { img: "vivid-offer2.png", title: "2-for-1 Cocktails", price: "£12.00" }
            ].map((offer, i) => (
              <div key={i} className="min-w-[160px] liquid-glass rounded-[24px] p-2 snap-center">
                <div className="rounded-[18px] overflow-hidden mb-3 relative aspect-square">
                  <img src={`/__mockup/images/${offer.img}`} alt={offer.title} className="w-full h-full object-cover" />
                </div>
                <div className="px-2 pb-2">
                  <h4 className="text-white font-semibold text-sm mb-1">{offer.title}</h4>
                  <span className="text-[#D4A843] font-bold">{offer.price}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Tab Bar */}
      <div 
        className="absolute bottom-0 left-0 right-0 z-20 pb-8 pt-4 px-6 liquid-glass rounded-t-[32px]"
        style={{ borderBottom: 'none' }}
      >
        <div className="flex justify-between items-center">
          {[
            { icon: Home, label: "Home", active: true },
            { icon: Search, label: "Book", active: false },
            { icon: Heart, label: "Order", active: false },
            { icon: Star, label: "Loyalty", active: false },
            { icon: Menu, label: "More", active: false }
          ].map((tab, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <tab.icon size={24} color={tab.active ? "white" : "rgba(255,255,255,0.4)"} className={tab.active ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" : ""} />
              <span className={`text-[10px] font-medium ${tab.active ? 'text-white' : 'text-white/40'}`}>
                {tab.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
