// client/src/utils/phoneVault.js

export function getOrCreatePhoneNumber(nickname) {
  const rawName = (nickname || 'Peer').trim();
  const cleanName = rawName.toLowerCase();
  const key = `dropwire_phone_${cleanName}`;
  let phone = localStorage.getItem(key);

  if (!phone) {
    const part1 = Math.floor(100 + Math.random() * 900);
    const part2 = Math.floor(1000 + Math.random() * 9000);
    phone = `${part1}-${part2}`;
    try { localStorage.setItem(key, phone); } catch (e) {}
  }

  try {
    localStorage.setItem('dropwire_display_name', rawName);
    localStorage.setItem('dropwire_my_phone', phone);
  } catch (e) {}
  return phone;
}

export function getOrCreateIdentity() {
  const displayName = localStorage.getItem('dropwire_display_name') || '';
  let phoneNumber = localStorage.getItem('dropwire_my_phone') || '';
  if (displayName && !phoneNumber) {
    phoneNumber = getOrCreatePhoneNumber(displayName);
  }
  return { displayName: displayName || 'Peer', phoneNumber: phoneNumber || '000-0000', hasSavedIdentity: Boolean(displayName) };
}

export function updateDisplayName(newName) {
  const cleaned = (newName || 'Peer').trim();
  const currentPhone = localStorage.getItem('dropwire_my_phone') || getOrCreatePhoneNumber(cleaned);
  try {
    localStorage.setItem('dropwire_display_name', cleaned);
    localStorage.setItem(`dropwire_phone_${cleaned.toLowerCase()}`, currentPhone);
  } catch (e) {}
  return { displayName: cleaned, phoneNumber: currentPhone };
}

export function getFriendsList(myPhone) {
  if (!myPhone) return [];
  try {
    const raw = localStorage.getItem(`dropwire_friends_${myPhone}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addOrUpdateFriend(myPhone, friendPhone, friendName, sharedRoomId = null) {
  if (!myPhone || !friendPhone || myPhone === friendPhone) return [];
  const list = getFriendsList(myPhone);
  const existingIdx = list.findIndex(f => f.phone === friendPhone);
  const deterministicRoom = sharedRoomId || `saved_${[myPhone, friendPhone].sort().join('_')}`;

  if (existingIdx > -1) {
    list[existingIdx].name = friendName || list[existingIdx].name;
    list[existingIdx].roomId = deterministicRoom;
  } else {
    list.push({
      phone: friendPhone,
      name: friendName || 'Peer',
      roomId: deterministicRoom,
      addedAt: Date.now()
    });
  }

  try {
    localStorage.setItem(`dropwire_friends_${myPhone}`, JSON.stringify(list));
  } catch (e) {}
  return list;
}

export function removeFriendAndVault(myPhone, friendPhone) {
  if (!myPhone || !friendPhone) return [];
  const list = getFriendsList(myPhone).filter(f => f.phone !== friendPhone);
  try {
    localStorage.setItem(`dropwire_friends_${myPhone}`, JSON.stringify(list));
    localStorage.removeItem(`dropwire_vault_${myPhone}_${friendPhone}`);
  } catch (e) {}
  return list;
}

export function getSavedChatVault(myPhone, peerPhone) {
  if (!myPhone || !peerPhone) return null;
  try {
    const raw = localStorage.getItem(`dropwire_vault_${myPhone}_${peerPhone}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const deletedSet = new Set(parsed.deletedIds || []);
    return {
      ...parsed,
      deletedIds: Array.from(deletedSet),
      messages: (parsed.messages || []).filter(m => !deletedSet.has(m.id))
    };
  } catch {
    return null;
  }
}

export function recordDeletedMessageInVault(myPhone, peerPhone, messageId) {
  if (!myPhone || !peerPhone || !messageId) return;
  const existing = getSavedChatVault(myPhone, peerPhone);
  if (!existing) return;
  const deletedSet = new Set(existing.deletedIds || []);
  deletedSet.add(messageId);
  const filteredMessages = (existing.messages || []).filter(m => m.id !== messageId);
  try {
    localStorage.setItem(
      `dropwire_vault_${myPhone}_${peerPhone}`,
      JSON.stringify({
        updatedAt: Date.now(),
        deletedIds: Array.from(deletedSet),
        messages: filteredMessages
      })
    );
  } catch (e) {}
}

export function saveChatToVault(myPhone, peerPhone, messages, peerName = 'Peer') {
  if (!myPhone || !peerPhone) return;
  addOrUpdateFriend(myPhone, peerPhone, peerName);
  const existing = getSavedChatVault(myPhone, peerPhone);
  const deletedSet = new Set(existing?.deletedIds || []);

  // Exclude security alerts and self-destructing Phantom messages from ever being written to disk!
  let cleanMessages = messages
    .filter(m => m.type !== 'system-security-incident' && !m.isPhantom && !deletedSet.has(m.id))
    .map(m => {
      if (m.type === 'file') {
        const { downloadUrl, ...rest } = m;
        return { ...rest, savedFromPastSession: true };
      }
      return m;
    });

  const vaultKey = `dropwire_vault_${myPhone}_${peerPhone}`;

  // Self-healing Quota Ring-Buffer: if 5MB localStorage limit is reached, trim oldest messages until write succeeds
  let maxRetries = 4; // MAX_TICK_BURST guard
  while (cleanMessages.length > 0) {
    try {
      localStorage.setItem(
        vaultKey,
        JSON.stringify({
          updatedAt: Date.now(),
          deletedIds: Array.from(deletedSet).slice(-200),
          messages: cleanMessages
        })
      );
      return;
    } catch (quotaErr) {
      cleanMessages = cleanMessages.slice(Math.max(1, Math.floor(cleanMessages.length * 0.25)));
    }
  }
}

export function deleteChatFromVault(myPhone, peerPhone) {
  if (!myPhone || !peerPhone) return;
  try {
    localStorage.removeItem(`dropwire_vault_${myPhone}_${peerPhone}`);
  } catch (e) {}
}

