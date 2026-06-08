import React from 'react';
import { Bell, Home, Calendar, Coffee, Gift, MoreHorizontal, ChevronRight, Trophy } from 'lucide-react';

export function Deep() {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ width: 390, height: 844, overflow: 'hidden', position: 'relative', fontFamily: "'Montserrat', sans-serif", backgroundColor: '#0A1628', color: '#ffffff' }}>
        {/* Background glow effects */}
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '60%', height: '30%', background: 'radial-gradient(circle, rgba(0,71,171,0.4) 0%, rgba(10,22,40,0) 70%)', filter: 'blur(40px)', zIndex: 0 }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '-10%', width: '50%', height: '40%', background: 'radial-gradient(circle, rgba(212,168,67,0.15) 0%, rgba(10,22,40,0) 70%)', filter: 'blur(50px)', zIndex: 0 }} />
        
        {/* Content Container */}
        <div style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', zIndex: 1, position: 'relative', paddingBottom: 100 }}>
          
          {/* Header */}
          <div style={{ padding: '56px 24px 0px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, color: '#ffffff' }}>THE <span style={{ color: '#D4A843' }}>147</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative' }}>
                <Bell size={24} color="#ffffff" />
                <div style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, backgroundColor: '#ff3b30', borderRadius: '50%', border: '2px solid #0A1628' }} />
              </div>
              <img src="/__mockup/images/avatar.png" style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', objectFit: 'cover' }} alt="Avatar" />
            </div>
          </div>

          {/* Greeting */}
          <div style={{ padding: '12px 24px 0px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: -0.3 }}>Good evening, James 👋</div>
          </div>

          <div style={{ padding: '16px 24px 0' }}>
            {/* Points Pill */}
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 8, 
              padding: '8px 16px', 
              borderRadius: 30, 
              background: 'linear-gradient(180deg, rgba(212,168,67,0.15) 0%, rgba(212,168,67,0.05) 100%)',
              borderTop: '1px solid rgba(212,168,67,0.4)',
              borderBottom: '1px solid rgba(212,168,67,0.1)',
              borderLeft: '1px solid rgba(212,168,67,0.2)',
              borderRight: '1px solid rgba(212,168,67,0.2)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
              marginBottom: 24
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#D4A843', boxShadow: '0 0 8px #D4A843' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#D4A843' }}>Gold Member · 1,240 pts</span>
            </div>

            {/* Upcoming World Cup Card */}
            <div style={{
              position: 'relative',
              borderRadius: 20,
              padding: '16px 18px',
              background: 'linear-gradient(180deg, rgba(19,39,66,0.7) 0%, rgba(10,22,40,0.8) 100%)',
              borderTop: '1px solid rgba(255,255,255,0.15)',
              borderBottom: '1px solid rgba(0,0,0,0.5)',
              borderLeft: '1px solid rgba(255,255,255,0.05)',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              backdropFilter: 'blur(30px)',
              WebkitBackdropFilter: 'blur(30px)',
              boxShadow: '0 16px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
              marginBottom: 20,
              overflow: 'hidden'
            }}>
              {/* Gold glow top-left */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: 120, height: 80, background: 'radial-gradient(circle, rgba(212,168,67,0.12) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(20px)' }} />

              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 16 }}>🏆</span>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: '#D4A843' }}>WORLD CUP 2026</span>
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>Next England matches</span>
              </div>

              {/* Fixture rows */}
              {[
                { flag1: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', team1: 'ENG', flag2: '🇭🇷', team2: 'CRO', day: 'Wed', date: '17 Jun', time: '21:00' },
                { flag1: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', team1: 'ENG', flag2: '🇬🇭', team2: 'GHA', day: 'Tue', date: '23 Jun', time: '21:00' },
              ].map((m, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderTop: i === 0 ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(255,255,255,0.07)',
                }}>
                  {/* Teams */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{m.flag1}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{m.team1}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500, marginInline: 2 }}>vs</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{m.team2}</span>
                    <span style={{ fontSize: 18 }}>{m.flag2}</span>
                  </div>
                  {/* Date + time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11, color: '#D4A843', fontWeight: 600 }}>{m.day},</span>
                    <span style={{ fontSize: 11, color: '#D4A843', fontWeight: 600 }}>{m.date}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500, marginLeft: 2 }}>{m.time}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Action Row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 32, overflowX: 'auto', paddingBottom: 8, marginInline: -24, paddingInline: 24, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {[
                { icon: Calendar, label: 'Book Table', color: '#0047AB' },
                { icon: Coffee, label: 'Order Food', color: '#D4A843' },
                { icon: Trophy, label: 'Loyalty', color: '#ffffff' },
                { icon: Gift, label: 'Offers', color: '#ffffff' }
              ].map((action, i) => (
                <div key={i} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 80
                }}>
                  <div style={{
                    width: 64, height: 64,
                    borderRadius: 20,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                    borderTop: '1px solid rgba(255,255,255,0.15)',
                    borderBottom: '1px solid rgba(0,0,0,0.3)',
                    borderLeft: '1px solid rgba(255,255,255,0.05)',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.2)'
                  }}>
                    <action.icon size={24} color={action.color} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{action.label}</span>
                </div>
              ))}
            </div>

            {/* Promotional Banner Carousel */}
            <div style={{
              position: 'relative',
              borderRadius: 24,
              height: 200,
              marginBottom: 32,
              overflow: 'hidden',
              borderTop: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 16px 32px rgba(0,0,0,0.5)'
            }}>
              <img src="/__mockup/images/snooker-promo.png" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Promo" />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(10,22,40,0.9) 0%, rgba(10,22,40,0) 100%)' }} />
              <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#D4A843', marginBottom: 4 }}>TOURNAMENT</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', marginBottom: 8 }}>Friday Night Masters</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Join now and win £500 <ChevronRight size={14} />
                </div>
              </div>
            </div>

            {/* Special Offers */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff' }}>Special Offers</h2>
              <span style={{ fontSize: 13, color: '#D4A843', fontWeight: 600 }}>View All</span>
            </div>
            
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', marginInline: -24, paddingInline: 24, paddingBottom: 24, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {[
                { img: '/__mockup/images/food-offer.png', title: 'Burger & Pint', price: '£12' },
                { img: '/__mockup/images/cocktail-offer.png', title: '2 for 1 Cocktails', price: '£10' }
              ].map((offer, i) => (
                <div key={i} style={{
                  minWidth: 160,
                  borderRadius: 20,
                  overflow: 'hidden',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                }}>
                  <div style={{ height: 100, position: 'relative' }}>
                    <img src={offer.img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={offer.title} />
                  </div>
                  <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', marginBottom: 4 }}>{offer.title}</div>
                    <div style={{ fontSize: 13, color: '#D4A843', fontWeight: 700 }}>{offer.price}</div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Bottom Tab Bar */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 84,
          background: 'rgba(10,22,40,0.8)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          paddingBottom: 20, // For iPhone home indicator area
          zIndex: 10,
          boxShadow: '0 -8px 32px rgba(0,0,0,0.4)'
        }}>
          {[
            { icon: Home, label: 'Home', active: true },
            { icon: Calendar, label: 'Book', active: false },
            { icon: Coffee, label: 'Order', active: false },
            { icon: Trophy, label: 'Loyalty', active: false },
            { icon: MoreHorizontal, label: 'More', active: false },
          ].map((tab, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <tab.icon size={24} color={tab.active ? '#D4A843' : 'rgba(255,255,255,0.4)'} />
              <span style={{ fontSize: 10, fontWeight: 600, color: tab.active ? '#D4A843' : 'rgba(255,255,255,0.4)' }}>{tab.label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default Deep;