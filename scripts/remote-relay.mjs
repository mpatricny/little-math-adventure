#!/usr/bin/env node
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';

const PORT = Number(process.env.REMOTE_RELAY_PORT || 8787);
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const peers = new Map();

function createRoomCode() {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let code = '';
    for (let i = 0; i < 4; i += 1) {
      code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('Unable to allocate room code');
}

function getLocalAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

function send(socket, message) {
  if (socket.destroyed) return;
  const payload = Buffer.from(JSON.stringify(message));
  const header = [];
  header.push(0x81);
  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 65536) {
    header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  } else {
    header.push(127, 0, 0, 0, 0);
    header.push(
      (payload.length >> 24) & 0xff,
      (payload.length >> 16) & 0xff,
      (payload.length >> 8) & 0xff,
      payload.length & 0xff,
    );
  }
  socket.write(Buffer.concat([Buffer.from(header), payload]));
}

function sendPeerStatus(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const status = {
    hostConnected: Boolean(room.host),
    controllerCount: room.controllers.size,
  };
  if (room.host) send(room.host.socket, { kind: 'peerStatus', status });
  for (const controller of room.controllers) {
    send(controller.socket, { kind: 'peerStatus', status });
  }
}

function removePeer(peer) {
  const room = peer.room ? rooms.get(peer.room) : null;
  if (room) {
    if (room.host === peer) room.host = null;
    room.controllers.delete(peer);
    if (!room.host && room.controllers.size === 0) {
      rooms.delete(peer.room);
    } else {
      sendPeerStatus(peer.room);
    }
  }
  peers.delete(peer.socket);
}

function handleHello(peer, message) {
  if (message.role === 'host') {
    const roomCode = createRoomCode();
    const room = {
      host: peer,
      controllers: new Set(),
      lastState: null,
    };
    peer.role = 'host';
    peer.room = roomCode;
    rooms.set(roomCode, room);
    send(peer.socket, { kind: 'welcome', role: 'host', room: roomCode, clientId: peer.id });
    sendPeerStatus(roomCode);
    return;
  }

  const roomCode = String(message.room || '').trim().toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) {
    send(peer.socket, { kind: 'error', message: `Room ${roomCode || '(empty)'} not found` });
    peer.socket.end();
    return;
  }

  peer.role = 'controller';
  peer.room = roomCode;
  room.controllers.add(peer);
  send(peer.socket, { kind: 'welcome', role: 'controller', room: roomCode, clientId: peer.id });
  if (room.lastState) send(peer.socket, { kind: 'state', state: room.lastState });
  sendPeerStatus(roomCode);
}

function handleMessage(peer, message) {
  if (message.kind === 'hello') {
    handleHello(peer, message);
    return;
  }

  if (!peer.room || !peer.role) {
    send(peer.socket, { kind: 'error', message: 'Client must send hello first' });
    return;
  }

  const room = rooms.get(peer.room);
  if (!room) return;

  if (message.kind === 'state' && peer.role === 'host') {
    room.lastState = message.state;
    for (const controller of room.controllers) {
      send(controller.socket, message);
    }
  }

  if (message.kind === 'command' && peer.role === 'controller' && room.host) {
    send(room.host.socket, message);
  }
}

function parseFrames(peer, chunk) {
  peer.buffer = Buffer.concat([peer.buffer, chunk]);

  while (peer.buffer.length >= 2) {
    const opcode = peer.buffer[0] & 0x0f;
    const masked = (peer.buffer[1] & 0x80) !== 0;
    let payloadLength = peer.buffer[1] & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (peer.buffer.length < offset + 2) return;
      payloadLength = peer.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (peer.buffer.length < offset + 8) return;
      const high = peer.buffer.readUInt32BE(offset);
      const low = peer.buffer.readUInt32BE(offset + 4);
      offset += 8;
      if (high !== 0) {
        peer.socket.end();
        return;
      }
      payloadLength = low;
    }

    const maskOffset = offset;
    if (masked) offset += 4;
    if (peer.buffer.length < offset + payloadLength) return;

    let payload = peer.buffer.subarray(offset, offset + payloadLength);
    if (masked) {
      const mask = peer.buffer.subarray(maskOffset, maskOffset + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }
    peer.buffer = peer.buffer.subarray(offset + payloadLength);

    if (opcode === 0x8) {
      peer.socket.end();
      return;
    }
    if (opcode === 0x9) {
      peer.socket.write(Buffer.from([0x8a, 0x00]));
      continue;
    }
    if (opcode !== 0x1) continue;

    try {
      handleMessage(peer, JSON.parse(payload.toString('utf8')));
    } catch {
      send(peer.socket, { kind: 'error', message: 'Invalid JSON message' });
    }
  }
}

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Little Math Adventure remote relay is running.\n');
});

server.on('upgrade', (request, socket) => {
  const key = request.headers['sec-websocket-key'];
  if (!key) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }

  const accept = crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));

  const peer = {
    id: crypto.randomUUID(),
    socket,
    role: null,
    room: null,
    buffer: Buffer.alloc(0),
  };
  peers.set(socket, peer);

  socket.on('data', (chunk) => parseFrames(peer, chunk));
  socket.on('close', () => removePeer(peer));
  socket.on('end', () => removePeer(peer));
  socket.on('error', () => removePeer(peer));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Remote relay listening on ws://0.0.0.0:${PORT}`);
  for (const address of getLocalAddresses()) {
    console.log(`  ws://${address}:${PORT}`);
  }
});
