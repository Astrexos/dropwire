# DropWire

> Anonymous, zero-cloud peer-to-peer workspace for multi-gigabyte file streaming, encrypted chat, voice/video calls, and 60 FPS screen sharing.

---

## The Problem & The Solution

* **The Problem:** Cloud messaging apps (Discord, Telegram, Slack) enforce strict 25 MB – 2 GB upload limits, log user metadata, and require personal signups. Transferring multi-gigabyte files usually forces users to upload to third-party cloud storage first, wait twice (upload then download), and leave an unnecessary data trail on central servers.
* **The Solution:** DropWire establishes direct device-to-device WebRTC data pipes. Files stream directly hard-drive-to-hard-drive using the Origin Private File System (OPFS), meaning **zero cloud storage costs**, **zero server data retention**, and **near-zero RAM usage** during gigabyte-scale transfers.

---

## System Architecture

Below is the network and memory topology of DropWire:

```mermaid
flowchart TD
    subgraph PeerA ["Peer A: Sender (Electron / React)"]
        LocalFile["Local Disk / File"]
        OPFSA["Disk Reader - 128KB Chunks"]
        V8A["V8 Buffer - 2MB Watermark"]
        LocalFile --> OPFSA
        OPFSA --> V8A
    end

    subgraph Signaling ["Stateless Signaling Server (Node.js / ws)"]
        Switchboard["WebSocket Switchboard - HMAC Auth"]
        RoomRouter["Ephemeral Room Router"]
        Switchboard --- RoomRouter
    end

    subgraph PeerB ["Peer B: Receiver (Electron / React)"]
        V8B["V8 Buffer Pointer List"]
        OPFSB["UniversalDiskWriter - OPFS"]
        TargetDisk["Local Disk / Download"]
        V8B --> OPFSB
        OPFSB --> TargetDisk
    end

    PeerA -.->|1. SDP Offer and ICE Candidates| Switchboard
    Switchboard -.->|2. SDP Answer and ICE Routing| PeerB
    V8A <-->|3. Direct WebRTC DataChannel - Encrypted SCTP| V8B
    PeerA <-->|4. Visual SAS Verification| PeerB
```

---

## Key Engineering Highlights

### 1. Zero-RAM Disk Streaming (OPFS)
Buffering multi-gigabyte files in Chromium/V8 JavaScript heap memory causes immediate out-of-memory crashes. DropWire uses the **Origin Private File System (OPFS)**:
* Large outbound files are sliced sequentially from disk in 128 KB micro-chunks.
* Inbound chunks bypass RAM accumulation and flush directly to persistent local disk handles.
* Keeps application RAM footprint flat (~150 MB) whether transferring a 10 MB document or a 10 GB disk image.

### 2. High-Throughput Backpressure Management
Direct WebRTC DataChannel streaming can congest Chromium’s internal C++ DTLS threads if unpaced. DropWire utilizes an event-driven `bufferedAmountLowThreshold` (512 KB) and a 2 MB sliding high-water mark to prevent UDP packet saturation and maintain continuous wire speeds.

### 3. Ephemeral Zero-Knowledge Identity
* **No Accounts or Phone Numbers:** Users connect via disposable 7-digit line IDs.
* **Multi-Stage Cipher Pipeline:** Chat messages and voice notes are encrypted device-to-device using `PBKDF2-HMAC-SHA512` key derivation, bitwise scrambling, and `AES-256-GCM`.
* **Man-in-the-Middle (MitM) Defense:** Both peers independently compute and visually verify a 4-digit **Short Authentication String (SAS)** derived directly from DTLS session fingerprints.

### 4. 60 FPS Desktop Capture Without Windows Borders
Configured with custom Electron capture flags (`DXGI/GDI` bypass) that eliminate the Windows Graphics Capture yellow selection border, supporting clean 60 FPS desktop streaming with loopback audio routing.

---

## Tech Stack

* **Desktop Framework:** Electron, Node.js
* **Frontend:** React 19, Vite, TailwindCSS
* **Networking & Transport:** WebRTC (DataChannels, MediaStreams), WebSockets
* **Storage & Hardware:** Origin Private File System (OPFS), Web Audio API, Web Crypto API
* **Security:** AES-256-GCM, PBKDF2-HMAC-SHA512, Short Authentication Strings (SAS)

---

## Quick Start (Client Setup)

### Prerequisites
* Node.js 18+
* npm or pnpm

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Astrexos/dropwire.git
cd dropwire/client
npm install
```

### 2. Configure Environment
Create a `.env` file in the `client/` directory (or copy `.env.example`):
```bash
VITE_SIGNALING_URL=ws://127.0.0.1:8080
VITE_E2EE_SECRET=your_custom_salt_here
```
*(The app defaults to `ws://127.0.0.1:8080` for local signaling).*

### 3. Start the Desktop App
```bash
npm run dev
```

*Tip: Press `F8` inside the running app during development to spawn a second in-memory peer window to test live P2P file transfers and calling on a single machine.*

---