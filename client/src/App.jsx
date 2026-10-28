// client/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import Lobby from './components/Lobby';
import MultiUserWorkspace from './components/MultiUserWorkspace';
import SettingsModal from './components/SettingsModal';
import { getOrCreatePhoneNumber, getOrCreateIdentity, getSavedChatVault } from './utils/phoneVault';

const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_URL || 'ws://127.0.0.1:8080';

export default function App() {
  const savedIdentity = getOrCreateIdentity();
  const [ws, setWs] = useState(null);
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState(savedIdentity.hasSavedIdentity ? savedIdentity.displayName : '');
  const [myPhone, setMyPhone] = useState(savedIdentity.hasSavedIdentity ? savedIdentity.phoneNumber : '');
  const [sessionToken, setSessionToken] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  
  const [appState, setAppState] = useState(savedIdentity.hasSavedIdentity ? 'lobby' : 'login'); 
  const [nickname, setNickname] = useState(savedIdentity.hasSavedIdentity ? savedIdentity.displayName : '');
  const appStateRef = useRef(appState);
  useEffect(() => { appStateRef.current = appState; }, [appState]);
  
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [roomMembers, setRoomMembers] = useState([]);
  const [initialHistory, setInitialHistory] = useState([]);
  const [pinnedId, setPinnedId] = useState(null);
  const [isStealthMode, setIsStealthMode] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Tracks if the user invited someone and is actively waiting for them to accept
  const [isAwaitingPeerJoin, setIsAwaitingPeerJoin] = useState(false);

  useEffect(() => {
    const onOpenSettings = () => setShowSettingsModal(true);
    window.addEventListener('dropwire-open-settings', onOpenSettings);
    return () => window.removeEventListener('dropwire-open-settings', onOpenSettings);
  }, []);

  const [incomingInvite, setIncomingInvite] = useState(null); 
  const [roomNotification, setRoomNotification] = useState(null);

  useEffect(() => {
    const socket = new WebSocket(SIGNALING_SERVER);
    setWs(socket);

    socket.onopen = () => {
      const idObj = getOrCreateIdentity();
      if (idObj.hasSavedIdentity) {
        const phone = getOrCreatePhoneNumber(idObj.displayName);
        setMyName(idObj.displayName);
        setMyPhone(phone);
        socket.send(JSON.stringify({ type: 'join-lobby', name: idObj.displayName, phone }));
        setAppState('lobby');
      }
    };

    socket.onmessage = (event) => {
      let data;
      try {
        const rawStr = event.data;
        data = event._parsedCache || (event._parsedCache = JSON.parse(rawStr));
      } catch (e) {
        return;
      }

      if (data.type === 'welcome') {
        sessionStorage.removeItem('dropwire_my_id');
        setMyId(data.myId);
        setMyName(data.myName);
        if (data.myPhone) setMyPhone(data.myPhone);
        setSessionToken(data.sessionToken);
      } else if (data.type === 'lobby-update') {
        setOnlineUsers(Array.isArray(data.users) ? data.users : []);
      } else if (data.type === 'incoming-invite') {
        setIncomingInvite(data);
      } else if (data.type === 'room-joined') {
        setCurrentRoomId(data.roomId);
        const joinedMembers = data.members || [];
        setRoomMembers(joinedMembers);
        
        // If 2 or more members are already in the room, unlock immediately!
        if (joinedMembers.length >= 2) {
          setIsAwaitingPeerJoin(false);
        }

        setInitialHistory(prev => {
          const mergedMap = new Map();
          prev.forEach(m => mergedMap.set(m.id, m));
          (data.history || []).forEach(m => mergedMap.set(m.id, m));
          return Array.from(mergedMap.values());
        });
        setPinnedId(data.pinnedMessageId || null);
        setAppState('chat');
        setIncomingInvite(null);
      } else if (data.type === 'peer-joined-room') {
        setRoomMembers(prev => [...prev.filter(m => m.id !== data.peer.id), data.peer]);
        // The invited peer has accepted and entered the room -> Unlock the chat!
        setIsAwaitingPeerJoin(false);
        showNotification(`${data.peer.name} joined the room.`);
      } else if (data.type === 'peer-left-room') {
        setRoomMembers(prev => prev.filter(m => m.id !== data.peerId));
        showNotification(data.reason === 'disconnected' ? `${data.peerName} lost connection.` : `${data.peerName} left the room.`);
      } else if (data.type === 'room-pinned-updated') {
        setPinnedId(data.pinnedMessageId);
      } else if (data.type === 'security-error') {
        showNotification(`Security Alert: ${data.message}`);
      } else if (data.type === 'you-left-room') {
        setAppState('lobby');
        setCurrentRoomId(null);
        setRoomMembers([]);
        setInitialHistory([]);
        setPinnedId(null);
        setIsAwaitingPeerJoin(false);
      }
    };

    let lastSyncTs = 0;
    const syncInterval = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN || !SIGNALING_SERVER.startsWith('wss://')) return;
      if (document.hidden) return;
      const now = Date.now();
      const targetInterval = appStateRef.current === 'chat' ? 1000 : 5000;
      if (now - lastSyncTs >= targetInterval) {
        lastSyncTs = now;
        socket.send(JSON.stringify({ type: 'sync' }));
      }
    }, 1000);

    return () => {
      clearInterval(syncInterval);
      socket.close();
    };
  }, []);

  function showNotification(msg) {
    setRoomNotification(msg);
    setTimeout(() => setRoomNotification(null), 4000);
  }

  function sendAuthenticated(payload) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...payload,
        token: sessionToken,
        fromId: myId
      }));
    }
  }

  function joinLobby(e) {
    if (e) e.preventDefault();
    if (!nickname.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
    const phone = getOrCreatePhoneNumber(nickname.trim());
    setMyName(nickname.trim());
    setMyPhone(phone);
    ws.send(JSON.stringify({ type: 'join-lobby', name: nickname.trim(), phone }));
    setAppState('lobby');

    const params = new URLSearchParams(window.location.search);
    const qrDialTarget = params.get('dial');
    if (qrDialTarget) {
      setTimeout(() => dialByPhoneNumber(qrDialTarget), 800);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  // 1. Inviting an online peer: Place the sender in the waiting state until peer accepts!
  function startRoomWithPeer(targetId) {
    if (currentRoomId) {
      sendAuthenticated({ type: 'leave-room' });
    }
    const targetUser = onlineUsers.find(u => u.id === targetId);
    const sharedRoomId = (myPhone && targetUser?.phone)
      ? `saved_${[myPhone, targetUser.phone].sort().join('_')}`
      : Math.random().toString(36).substring(2, 8);

    if (myPhone && targetUser?.phone) {
      const saved = getSavedChatVault(myPhone, targetUser.phone);
      setInitialHistory(saved?.messages || []);
    } else {
      setInitialHistory([]);
    }

    // Await peer's acceptance!
    setIsAwaitingPeerJoin(true);
    sendAuthenticated({ type: 'create-room', roomId: sharedRoomId, isStealth: isStealthMode });
    sendAuthenticated({ type: 'invite-peer', targetId, roomId: sharedRoomId, isStealth: isStealthMode });
  }

  // 2. Opening a Saved Chat: Immediately available without waiting for the peer!
  function joinSavedRoomSilently(sharedRoomId, friendPhone) {
    if (currentRoomId && currentRoomId !== sharedRoomId) {
      sendAuthenticated({ type: 'leave-room' });
    }
    const saved = getSavedChatVault(myPhone, friendPhone);
    setInitialHistory(saved?.messages || []);
    setIsAwaitingPeerJoin(false); // Vault is local, zero waiting screen!
    sendAuthenticated({ type: 'join-by-code', roomId: sharedRoomId, isStealth: isStealthMode });
  }

  function dialByPhoneNumber(targetPhone) {
    const targetUser = onlineUsers.find(u => u.phone === targetPhone.trim());
    if (!targetUser) {
      showNotification(`Number #${targetPhone} is currently offline or unreachable.`);
      return;
    }
    if (targetUser.status !== 'idle') {
      showNotification(`Line Busy: ${targetUser.name} is already in another call.`);
      return;
    }
    startRoomWithPeer(targetUser.id);
  }

  function invitePeerFromInside(targetId) {
    if (!currentRoomId) return;
    sendAuthenticated({ type: 'invite-peer', targetId, roomId: currentRoomId, isStealth: isStealthMode });
    showNotification('Invitation sent!');
  }

  function leaveRoom() {
    setIsAwaitingPeerJoin(false);
    sendAuthenticated({ type: 'leave-room' });
  }

  return (
    <div className="flex w-screen h-[100dvh] bg-[#060913] text-slate-100 font-sans overflow-hidden select-none">
      <div className="flex-1 flex flex-col w-full h-full relative">

        <SettingsModal 
          isOpen={showSettingsModal} 
          onClose={() => setShowSettingsModal(false)} 
          onNameChanged={(updatedName) => {
            setMyName(updatedName);
            if (ws?.readyState === WebSocket.OPEN && myPhone) {
              ws.send(JSON.stringify({ type: 'join-lobby', name: updatedName, phone: myPhone }));
            }
          }}
        />

        {roomNotification && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs font-semibold z-50 animate-in fade-in slide-in-from-top-4">
            <AlertCircle size={15} /> {roomNotification}
          </div>
        )}

        {incomingInvite && (
          <div className="absolute inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm p-4">
            <div className="bg-[#0d1322] p-6 rounded-2xl border border-slate-800 shadow-2xl text-center max-w-sm w-full">
              <h3 className="text-base font-bold text-white mb-1">Incoming Connection</h3>
              <p className="text-xs text-slate-300 mb-4">
                <span className="font-bold text-blue-400">{incomingInvite.fromName}</span> invited you to an encrypted workspace.
              </p>

              <div className={`p-3 rounded-xl border text-xs mb-4 text-left ${
                incomingInvite.isStealth
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                  : 'bg-[#060913] border-slate-800 text-blue-300'
              }`}>
                <span className="text-[10px] uppercase font-bold tracking-wider block opacity-70 mb-0.5">
                  Session Policy:
                </span>
                <span className="font-semibold">
                  {incomingInvite.isStealth ? 'Stealth Mode (Encrypted Relay)' : 'Direct P2P (Turbo Mesh)'}
                </span>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setIncomingInvite(null)} 
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition text-xs cursor-pointer"
                >
                  Decline
                </button>
                <button 
                  onClick={() => {
                    const requiredStealth = Boolean(incomingInvite.isStealth);
                    setIsStealthMode(requiredStealth);
                    if (myPhone && incomingInvite.fromPhone) {
                      const saved = getSavedChatVault(myPhone, incomingInvite.fromPhone);
                      setInitialHistory(saved?.messages || []);
                    }
                    sendAuthenticated({ 
                      type: 'accept-invite', 
                      roomId: incomingInvite.roomId, 
                      isStealth: requiredStealth 
                    });
                  }} 
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/20 cursor-pointer"
                >
                  <ShieldCheck size={15}/> Accept & Join
                </button>
              </div>
            </div>
          </div>
        )}

        {appState === 'login' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#060913]">
            <form onSubmit={joinLobby} className="bg-[#0d1322] p-6 rounded-2xl shadow-2xl w-full max-w-xs text-center border border-slate-800">
              <h2 className="text-base font-bold text-white mb-4">Enter DropWire</h2>
              <input 
                type="text" 
                placeholder="Choose a display name..." 
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                className="w-full bg-[#060913] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-4 transition"
                autoFocus
              />
              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition text-xs shadow-lg shadow-blue-600/20 cursor-pointer"
              >
                Continue
              </button>
            </form>
          </div>
        )}

        {(appState === 'lobby' || appState === 'chat') && (
          <Lobby 
            ws={ws} 
            myId={myId} 
            myName={myName} 
            myPhone={myPhone}
            onlineUsers={onlineUsers} 
            onStartRoom={startRoomWithPeer} 
            onDialNumber={dialByPhoneNumber}
            onJoinSavedRoom={joinSavedRoomSilently}
            isStealthMode={isStealthMode}
            onToggleStealth={() => setIsStealthMode(prev => !prev)}
            onOpenSettings={() => setShowSettingsModal(true)}
            activeRoomId={appState === 'chat' ? currentRoomId : null}
            roomMembers={roomMembers}
            onInvitePeer={invitePeerFromInside}
            onLeaveRoom={leaveRoom}
          >
            {appState === 'chat' && (
              <MultiUserWorkspace 
                ws={ws}
                sendAuthenticated={sendAuthenticated}
                myId={myId}
                myName={myName}
                myPhone={myPhone}
                roomId={currentRoomId}
                members={roomMembers}
                initialHistory={initialHistory}
                pinnedId={pinnedId}
                onLeave={leaveRoom}
                isStealthMode={isStealthMode}
                isAwaitingPeerJoin={isAwaitingPeerJoin}
              />
            )}
          </Lobby>
        )}

      </div>
    </div>
  );
}

