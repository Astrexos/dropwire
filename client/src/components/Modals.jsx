// client/src/components/Modals.jsx
import React from 'react';
import { 
  Reply, Copy, Pin, Download, CheckSquare, Trash2, X, 
  Eye, AlertTriangle, CheckCircle2, Pencil
} from 'lucide-react';
import { containsUrl, isImageFile, isVideoFile } from '../utils/media';

export function ContextMenu({ contextMenu, myId, pinnedId, onReply, onEdit, onCopy, onTogglePin, onSelect, onDelete, onShowSeenBy }) {
  if (!contextMenu) return null;
  const m = contextMenu.message;
  const readCount = Array.isArray(m.readBy) ? m.readBy.filter(id => id !== m.senderId).length : 0;
  const canEdit = m.senderId === myId && !m.isPhantom && (m.type === 'text' || m.type === 'file');

  return (
    <div 
      style={{ top: contextMenu.y, left: contextMenu.x }}
      onClick={(e) => e.stopPropagation()}
      className="fixed bg-[#0d1322]/95 border border-slate-800 rounded-2xl shadow-2xl py-1.5 w-52 z-50 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 text-xs select-none"
    >
      {!m.isPhantom && (
        <button 
          onClick={() => onReply(m)}
          className="w-full px-3.5 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5 text-slate-200 transition cursor-pointer"
        >
          <Reply size={14} className="text-blue-400" /> Reply
        </button>
      )}

      {canEdit && onEdit && (
        <button 
          onClick={() => onEdit(m)}
          className="w-full px-3.5 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5 text-slate-200 transition cursor-pointer"
        >
          <Pencil size={14} className="text-amber-400" /> Edit Message
        </button>
      )}

      {!m.isPhantom && (
        <button 
          onClick={() => onCopy(m)}
          className="w-full px-3.5 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5 text-slate-200 transition cursor-pointer"
        >
          <Copy size={14} className="text-emerald-400" />
          {containsUrl(m.text || m.caption) ? 'Copy Link' :
           isImageFile(m.fileName, m.mimeType) ? 'Copy Image Link' :
           isVideoFile(m.fileName, m.mimeType) ? 'Copy Video Link' :
           'Copy Text'}
        </button>
      )}

      <button 
        onClick={() => onShowSeenBy(m)}
        className="w-full px-3.5 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5 text-slate-200 transition cursor-pointer"
      >
        <Eye size={14} className="text-cyan-400" />
        <span>Viewed by ({readCount})</span>
      </button>

      {!m.isPhantom && (
        <button 
          onClick={() => onTogglePin(m.id)}
          className="w-full px-3.5 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5 text-slate-200 transition cursor-pointer"
        >
          <Pin size={14} className="text-amber-400" /> {pinnedId === m.id ? 'Unpin' : 'Pin'}
        </button>
      )}

      {m.downloadUrl && m.type !== 'audio' && (
        <a 
          href={m.downloadUrl}
          download={m.fileName || 'file'}
          onClick={() => onCopy(m)}
          className="w-full px-3.5 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5 text-slate-200 transition cursor-pointer"
        >
          <Download size={14} className="text-blue-400" /> Download
        </a>
      )}

      {m.senderId === myId && (
        <button 
          onClick={() => onSelect(m.id)}
          className="w-full px-3.5 py-2 text-left hover:bg-white/[0.06] flex items-center gap-2.5 text-slate-200 transition cursor-pointer"
        >
          <CheckSquare size={14} className="text-blue-400" /> Select
        </button>
      )}

      {m.senderId === myId && (
        <div className="border-t border-slate-800 mt-1 pt-1">
          <button 
            onClick={() => onDelete(m.id)}
            className="w-full px-3.5 py-2 text-left hover:bg-red-500/15 flex items-center gap-2.5 text-red-400 transition cursor-pointer"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function SeenByModal({ message, members, myId, onClose }) {
  if (!message) return null;
  const readUserIds = new Set(message.readBy || []);
  const readers = members.filter(mem => readUserIds.has(mem.id) && mem.id !== message.senderId);

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm p-4 animate-in fade-in select-none text-xs"
    >
      <div 
        onClick={e => e.stopPropagation()}
        className="bg-[#0d1322] border border-slate-800 rounded-2xl max-w-xs w-full p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2 text-blue-400 font-bold">
            <Eye size={16} />
            <span>Viewed by ({readers.length})</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer">
            <X size={15} />
          </button>
        </div>

        {readers.length === 0 ? (
          <p className="text-slate-500 text-center py-4">No one else has viewed this message yet.</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
            {readers.map(mem => (
              <div key={mem.id} className="p-2.5 rounded-xl bg-[#060913] border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-400 font-bold flex items-center justify-center uppercase text-[11px]">
                    {mem.name ? mem.name.charAt(0) : '?'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-200 block">{mem.name} {mem.id === myId && '(You)'}</span>
                    <span className="text-[10px] text-slate-500 font-mono">#{mem.phone || mem.id.slice(0, 6)}</span>
                  </div>
                </div>
                <CheckCircle2 size={14} className="text-emerald-400" />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function MediaLightbox({ lightboxMedia, onClose }) {
  if (!lightboxMedia) return null;

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in"
    >
      <div className="absolute top-4 right-4 flex items-center gap-3" onClick={e => e.stopPropagation()}>
        <a 
          href={lightboxMedia.url} 
          download={lightboxMedia.fileName || 'media'}
          className="p-2.5 rounded-full bg-[#0d1322] hover:bg-slate-800 border border-slate-700 text-white transition shadow-lg"
          title="Download"
        >
          <Download size={18} />
        </a>
        <button 
          onClick={onClose}
          className="p-2.5 rounded-full bg-[#0d1322] hover:bg-slate-800 border border-slate-700 text-white transition shadow-lg cursor-pointer"
          title="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="max-w-4xl max-h-[85vh] p-4 flex items-center justify-center" onClick={e => e.stopPropagation()}>
        {lightboxMedia.type === 'image' ? (
          <img src={lightboxMedia.url} alt="Lightbox Preview" className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
        ) : (
          <video 
            src={lightboxMedia.url} 
            controls 
            autoPlay 
            onLoadedMetadata={(e) => {
              if (lightboxMedia.initialTime) e.target.currentTime = lightboxMedia.initialTime;
            }}
            className="max-w-full max-h-[80vh] rounded-xl shadow-2xl bg-black" 
          />
        )}
      </div>
    </div>
  );
}

export function LeaveRoomModal({ isOpen, onCancel, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0d1322] p-6 rounded-2xl border border-slate-800 shadow-2xl text-center max-w-sm w-full mx-4">
        <h3 className="text-base font-bold text-white mb-2">Leave Chat Room?</h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-6">
          Leaving will disconnect your active P2P channels and evaporate temporary OPFS transfer cache from this session.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition text-xs cursor-pointer">Stay</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition text-xs shadow-lg shadow-red-600/20 cursor-pointer">Leave Room</button>
        </div>
      </div>
    </div>
  );
}

export function DeleteConfirmationModal({ pendingDeleteIds, onCancel, onConfirm }) {
  if (!pendingDeleteIds || pendingDeleteIds.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0d1322] p-6 rounded-2xl border border-slate-800 shadow-2xl text-center max-w-sm w-full mx-4">
        <h3 className="text-base font-bold text-white mb-2">
          Delete {pendingDeleteIds.length === 1 ? 'Message' : 'Messages'}?
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-6">
          This will permanently remove {pendingDeleteIds.length === 1 ? 'this message' : `these ${pendingDeleteIds.length} messages`} for everyone in the room.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition text-xs cursor-pointer">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/20 cursor-pointer">
            <Trash2 size={13} /> Delete ({pendingDeleteIds.length})
          </button>
        </div>
      </div>
    </div>
  );
}

export function SecurityIncidentModal({ incident, onClose }) {
  if (!incident) return null;
  const isDanger = incident.variant === 'danger';

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-md p-4 animate-in fade-in duration-150 select-none"
    >
      <div 
        onClick={e => e.stopPropagation()}
        className={`bg-[#0d1322] border rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center gap-3 relative ${
          isDanger ? 'border-red-500/50' : 'border-amber-500/50'
        }`}
      >
        <div className={`p-3.5 rounded-2xl ${isDanger ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
          <AlertTriangle size={32} />
        </div>

        <h3 className="text-sm font-bold text-white tracking-wide">
          {incident.title}
        </h3>

        <p className="text-xs text-slate-300 leading-relaxed">
          {incident.message}
        </p>

        {incident.details && (
          <div className="w-full bg-[#060913] border border-slate-800 rounded-xl p-2.5 text-[11px] font-mono text-slate-400 text-left">
            <span className="text-slate-500 block text-[10px] uppercase tracking-wider mb-1">Defense Action:</span>
            {incident.details}
          </div>
        )}

        <button
          onClick={onClose}
          className={`w-full py-2.5 mt-2 rounded-xl text-xs font-bold text-white transition shadow-lg cursor-pointer ${
            isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'
          }`}
        >
          Acknowledge & Close
        </button>
      </div>
    </div>
  );
}

