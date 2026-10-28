// client/src/components/Lobby.jsx
import React, { useState, useEffect } from 'react';
import {
  Users, Phone, Copy, Check, Bookmark,
  QrCode, Trash2, Shield, Radio, ArrowRight,
  Search, Settings, LogOut, UserPlus
} from 'lucide-react';
import { getFriendsList, getSavedChatVault, removeFriendAndVault } from '../utils/phoneVault';

export default function Lobby({
  ws,
  myId,
  myName,
  myPhone,
  onlineUsers,
  onStartRoom,
  onDialNumber,
  onJoinSavedRoom,
  isStealthMode,
  onToggleStealth,
  onOpenSettings,
  activeRoomId = null,
  roomMembers = [],
  onInvitePeer = null,
  onLeaveRoom = null,
  children
}) {
  const [searchOrDialInput, setSearchOrDialInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [friendsList, setFriendsList] = useState(() => getFriendsList(myPhone));

  useEffect(() => {
    setFriendsList(getFriendsList(myPhone));
  }, [myPhone, onlineUsers, activeRoomId]);

  const otherUsers = onlineUsers.filter(u => u.id !== myId && u.name);
  const query = searchOrDialInput.trim().toLowerCase();

  const filteredFriends = friendsList.filter(
    f => !query || f.name?.toLowerCase().includes(query) || f.phone?.toLowerCase().includes(query)
  );
  const filteredPeers = otherUsers.filter(
    u => !query || u.name?.toLowerCase().includes(query) || u.phone?.toLowerCase().includes(query)
  );

  function handleCopyPhone() {
    if (!myPhone) return;
    navigator.clipboard.writeText(myPhone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDialSubmit(e) {
    e.preventDefault();
    if (!searchOrDialInput.trim()) return;
    onDialNumber(searchOrDialInput.trim());
    setSearchOrDialInput('');
  }

  function handleRemoveSavedCall(e, friendPhone) {
    e.stopPropagation();
    const updated = removeFriendAndVault(myPhone, friendPhone);
    setFriendsList(updated);
  }

  const isInActiveChat = Boolean(activeRoomId);
  const roomMemberIds = new Set(roomMembers.map(m => m.id));

  return (
    <div className="flex-1 w-full h-full min-h-0 flex bg-[#060913] text-slate-200 select-none overflow-hidden">
      <aside
        className={`${
          isInActiveChat ? 'hidden md:flex' : 'flex'
        } w-full md:w-[26%] md:min-w-[280px] md:max-w-[360px] h-full bg-[#0d1322] border-r border-slate-800/80 flex-col justify-between shrink-0 z-20`}
      >
        <div className="px-3 py-3 border-b border-slate-800/70 flex items-center gap-2.5">
          <button
            onClick={onOpenSettings}
            className="group w-9 h-9 rounded-full hover:bg-white/[0.06] text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
            title="Open Settings"
          >
            <Settings size={17} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>

          <form onSubmit={handleDialSubmit} className="relative flex-1 flex items-center">
            <Search size={14} className="absolute left-3.5 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search or dial ID..."
              value={searchOrDialInput}
              onChange={e => setSearchOrDialInput(e.target.value)}
              className="w-full bg-[#060913] border border-slate-800/90 rounded-full pl-9 pr-14 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
            {searchOrDialInput.trim() && (
              <button
                type="submit"
                className="absolute right-1.5 px-2.5 py-0.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold transition cursor-pointer"
              >
                Dial
              </button>
            )}
          </form>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-800/40">
          {isInActiveChat && (
            <div className="py-2 bg-blue-600/[0.04]">
              <div className="px-4 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-400">
                <span>Active Session ({roomMembers.length})</span>
                <button
                  onClick={onLeaveRoom}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold cursor-pointer"
                  title="Close Active Chat"
                >
                  <LogOut size={11} />
                  <span>Close</span>
                </button>
              </div>

              <div>
                {roomMembers.map(m => {
                  const isMe = m.id === myId;
                  return (
                    <div
                      key={m.id}
                      className="px-4 py-2 flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <div className="w-8 h-8 rounded-full bg-blue-600/25 text-blue-400 font-bold text-xs flex items-center justify-center uppercase">
                            {m.name ? m.name.slice(0, 2) : 'DW'}
                          </div>
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0d1322] absolute bottom-0 right-0" />
                        </div>
                        <span className="text-xs font-semibold text-white truncate">
                          {isMe ? `${m.name} (You)` : m.name}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {filteredFriends.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Saved Chats ({filteredFriends.length})</span>
                <Bookmark size={11} className="text-blue-400" />
              </div>

              <div>
                {filteredFriends.map(friend => {
                  const onlineMatch = otherUsers.find(u => u.phone === friend.phone);
                  const savedVault = getSavedChatVault(myPhone, friend.phone);
                  const sharedRoomId = friend.roomId || `saved_${[myPhone, friend.phone].sort().join('_')}`;
                  const isCurrentlyOpen = activeRoomId === sharedRoomId;

                  return (
                    <div
                      key={friend.phone}
                      onClick={() => {
                        if (!isCurrentlyOpen) {
                          onJoinSavedRoom(sharedRoomId, friend.phone);
                        }
                      }}
                      className={`group px-4 py-2.5 transition flex items-center justify-between gap-2.5 cursor-pointer ${
                        isCurrentlyOpen
                          ? 'bg-blue-600/20 border-l-2 border-blue-500'
                          : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-full bg-blue-600/20 text-blue-400 font-bold text-xs flex items-center justify-center uppercase">
                            {friend.name ? friend.name.slice(0, 2) : 'DW'}
                          </div>
                          <span
                            className={`w-2.5 h-2.5 rounded-full border-2 border-[#0d1322] absolute bottom-0 right-0 ${
                              onlineMatch ? 'bg-emerald-400' : 'bg-slate-600'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{friend.name}</div>
                          <div className="text-[11px] font-mono text-slate-400 truncate">
                            #{friend.phone} {savedVault ? `• ${savedVault.messages.length} msgs` : ''}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleRemoveSavedCall(e, friend.phone)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                        title="Remove Saved Chat"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="py-2">
            <div className="px-4 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>Online Peers ({filteredPeers.length})</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>

            {filteredPeers.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">
                No other peers online right now.
              </div>
            ) : (
              <div>
                {filteredPeers.map(user => {
                  const isAvailable = user.status === 'idle';
                  const isAlreadyInRoom = roomMemberIds.has(user.id);

                  return (
                    <div
                      key={user.id}
                      onClick={() => {
                        if (isAlreadyInRoom) return;
                        if (isInActiveChat && onInvitePeer && isAvailable) {
                          onInvitePeer(user.id);
                        } else if (isAvailable) {
                          onStartRoom(user.id);
                        }
                      }}
                      className={`group px-4 py-2.5 transition flex items-center justify-between gap-2.5 ${
                        isAlreadyInRoom
                          ? 'bg-emerald-500/10 cursor-default'
                          : isAvailable
                          ? 'hover:bg-white/[0.04] cursor-pointer'
                          : 'opacity-55 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-full bg-blue-600/20 text-blue-400 font-bold text-xs flex items-center justify-center uppercase">
                            {user.name ? user.name.slice(0, 2) : 'DW'}
                          </div>
                          <span
                            className={`w-2.5 h-2.5 rounded-full border-2 border-[#0d1322] absolute bottom-0 right-0 ${
                              isAvailable || isAlreadyInRoom ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{user.name}</div>
                          <div className="text-[11px] font-mono text-slate-400 truncate">
                            {user.phone ? `#${user.phone}` : 'Peer'} •{' '}
                            <span
                              className={
                                isAlreadyInRoom
                                  ? 'text-emerald-400'
                                  : isAvailable
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }
                            >
                              {isAlreadyInRoom ? 'In This Chat' : isAvailable ? 'Available' : 'In Call'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {!isAlreadyInRoom && isAvailable && (
                        <span className="px-2.5 py-1 rounded-lg bg-blue-600 group-hover:bg-blue-500 text-white text-[11px] font-bold transition shrink-0 flex items-center gap-1">
                          {isInActiveChat ? (
                            <>
                              <UserPlus size={12} /> Invite
                            </>
                          ) : (
                            'Connect'
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 bg-[#060913]/80 border-t border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center uppercase shadow">
                {(myName || 'DW').slice(0, 2)}
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#060913] absolute bottom-0 right-0" />
            </div>

            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate leading-tight">
                {myName || 'Peer'}
              </div>
              <div className="font-mono font-bold text-[11px] text-blue-400 truncate mt-0.5">
                #{myPhone || '---'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleCopyPhone}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="Copy My DropWire ID"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>

            <button
              onClick={() => setShowQrModal(true)}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition cursor-pointer"
              title="Show QR Code"
            >
              <QrCode size={14} />
            </button>

            {typeof onToggleStealth === 'function' && (
              <button
                disabled={isInActiveChat}
                onClick={onToggleStealth}
                className={`p-1.5 rounded-lg transition ${
                  isInActiveChat ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  isStealthMode
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'hover:bg-slate-800 text-slate-500 hover:text-slate-300'
                }`}
                title={`Stealth Relay: ${isStealthMode ? 'ON' : 'OFF'}`}
              >
                <Shield size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Flat static background - No GPU radial-gradient re-rasterization */}
      <main className="flex-1 h-full min-w-0 bg-[#060913] flex flex-col relative overflow-hidden">
        {isInActiveChat ? (
          children
        ) : (
          <div className="hidden md:flex flex-1 h-full flex-col items-center justify-center p-8">
            <div className="max-w-md w-full text-center space-y-5 bg-[#0d1322] border border-slate-800/80 rounded-3xl p-8 shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400 shadow-inner">
                <Radio size={26} />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Select a Chat or Dial a Line
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Click any Saved Chat or Online Peer on the left sidebar to open the conversation right here, or dial a 7-digit ID below.
                </p>
              </div>

              <form onSubmit={handleDialSubmit} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Dial 7-digit ID (e.g. 482-1920)..."
                  value={searchOrDialInput}
                  onChange={e => setSearchOrDialInput(e.target.value)}
                  className="flex-1 bg-[#060913] border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-blue-600/20 cursor-pointer shrink-0"
                >
                  <span>Dial</span>
                  <ArrowRight size={14} />
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {showQrModal && myPhone && (
        <div 
          onClick={() => setShowQrModal(false)}
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm p-4 animate-in fade-in"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-[#0d1322] border border-slate-800 rounded-2xl p-6 max-w-xs w-full text-center shadow-2xl flex flex-col items-center gap-3"
          >
            <h3 className="text-sm font-bold text-white">Scan to Dial #{myPhone}</h3>
            <div className="p-3 bg-white rounded-2xl shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/?dial=${myPhone}`)}`}
                alt="DropWire Dial QR"
                className="w-44 h-44 rounded-lg"
              />
            </div>
            <span className="font-mono text-base font-extrabold text-blue-400">{myPhone}</span>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 mt-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

