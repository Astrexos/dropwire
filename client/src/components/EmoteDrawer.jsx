// client/src/components/EmoteDrawer.jsx
import React, { useState } from 'react';
import { Smile, Film, Search, X } from 'lucide-react';
import { ALL_EMOJIS, UNIQUE_HD_GIFS } from '../constants/emotes';

export default function EmoteDrawer({ onSelectEmoji, onSelectGif, isSendingGif }) {
  const [activeTab, setActiveTab] = useState('emojis');
  const [gifSearchQuery, setGifSearchQuery] = useState('');

  const filteredGifs = UNIQUE_HD_GIFS.filter(g => g.tag.toLowerCase().includes(gifSearchQuery.toLowerCase()));

  return (
    <div 
      onClick={e => e.stopPropagation()}
      className="absolute bottom-14 left-0 bg-[#0d1322]/95 border border-slate-800 rounded-2xl shadow-2xl p-3 w-80 sm:w-88 z-30 animate-in fade-in zoom-in-95 backdrop-blur-md flex flex-col"
    >
      <div className="flex items-center gap-1 border-b border-slate-800 pb-2 mb-2">
        <button 
          onClick={() => setActiveTab('emojis')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'emojis' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Smile size={14} /> Emojis
        </button>
        <button 
          onClick={() => setActiveTab('gifs')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'gifs' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Film size={14} /> GIFs
        </button>
      </div>

      {activeTab === 'emojis' && (
        <div className="grid grid-cols-6 gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
          {ALL_EMOJIS.map((emoji, idx) => (
            <button
              key={idx}
              onClick={() => onSelectEmoji(emoji)}
              className="text-2xl p-1 rounded-xl transition-all duration-150 transform hover:scale-125 hover:bg-white/[0.06] active:scale-95 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'gifs' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#060913] border border-slate-800">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input 
              type="text" 
              placeholder="Search reaction GIFs..."
              value={gifSearchQuery}
              onChange={e => setGifSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-white placeholder:text-slate-500 outline-none w-full"
            />
            {gifSearchQuery && <button onClick={() => setGifSearchQuery('')} className="cursor-pointer"><X size={12} className="text-slate-400"/></button>}
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto custom-scrollbar p-1">
            {filteredGifs.length === 0 ? (
              <p className="col-span-2 text-center text-xs text-slate-500 py-6">No matching GIFs found</p>
            ) : (
              filteredGifs.map(g => (
                <button
                  key={g.id}
                  disabled={isSendingGif}
                  onClick={() => onSelectGif(g)}
                  className="rounded-xl overflow-hidden hover:ring-2 ring-blue-500 transition-all active:scale-95 bg-[#060913] aspect-video group relative shadow-md disabled:opacity-50 cursor-pointer"
                >
                  <img src={g.gif} alt={g.tag} className="w-full h-full object-cover" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

