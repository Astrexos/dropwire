// client/src/components/MutualVaultBar.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Flame, Lock } from 'lucide-react';
import { getSavedChatVault, saveChatToVault, deleteChatFromVault } from '../utils/phoneVault';

export default function MutualVaultBar({ sendAuthenticated, myName, myPhone, peer, messages, onLoadSavedMessages, onNotify }) {
  const [isSavedForMe, setIsSavedForMe] = useState(false);
  const lastClickTsRef = useRef(0);

  useEffect(() => {
    if (myPhone && peer?.phone) {
      const existingVault = getSavedChatVault(myPhone, peer.phone);
      if (existingVault && Array.isArray(existingVault.messages)) {
        setIsSavedForMe(true);
        onLoadSavedMessages(currentRoomMessages => {
          const map = new Map();
          existingVault.messages.forEach(m => map.set(m.id, m));
          (currentRoomMessages || []).forEach(m => map.set(m.id, m));
          return Array.from(map.values());
        });
      } else {
        setIsSavedForMe(false);
      }
    }
  }, [myPhone, peer?.phone]);

  useEffect(() => {
    if (isSavedForMe && myPhone && peer?.phone && messages.length > 0) {
      saveChatToVault(myPhone, peer.phone, messages, peer.name);
    }
  }, [isSavedForMe, messages, myPhone, peer?.phone]);

  if (!peer?.phone) return null;

  function handleSaveClick() {
    const now = Date.now();
    if (now - lastClickTsRef.current < 450) return; // 450ms spam cooldown
    lastClickTsRef.current = now;

    setIsSavedForMe(true);
    saveChatToVault(myPhone, peer.phone, messages, peer.name);
    onNotify('Chat saved privately for you. (Saved Calls)');

    if (sendAuthenticated) {
      sendAuthenticated({
        type: 'vault-notification',
        action: 'saved',
        userName: myName || 'A participant'
      });
    }
  }

  function handleUnsaveClick() {
    const now = Date.now();
    if (now - lastClickTsRef.current < 450) return; // 450ms spam cooldown
    lastClickTsRef.current = now;

    setIsSavedForMe(false);
    deleteChatFromVault(myPhone, peer.phone);
    onNotify('Switched to Void Mode. (Local copy removed)');

    if (sendAuthenticated) {
      sendAuthenticated({
        type: 'vault-notification',
        action: 'unsaved',
        userName: myName || 'A participant'
      });
    }
  }

  return (
    <div className="flex items-center gap-2 select-none">
      {!isSavedForMe ? (
        <button
          onClick={handleSaveClick}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-medium transition cursor-pointer"
          title="Default Void Mode: Chat will not save for you unless clicked"
        >
          <Flame size={13} className="text-amber-400" />
          <span>Void Mode • Request Save</span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[11px] font-mono">
            <Lock size={12} /> Saved (For Me)
          </span>
          <button
            onClick={handleUnsaveClick}
            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition cursor-pointer"
            title="Switch to Void Mode & delete your saved copy"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

