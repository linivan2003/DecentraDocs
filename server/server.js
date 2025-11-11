const { PeerServer } = require("peer");

const peerServer = PeerServer({
  port: 9000,
  path: "/",   // keep to this because nginx strips the "/signal" portion
  proxied: true,
});

peerServer.on("connection", (client) => {
  console.log("New peer:", client.getId());
  console.log(client);
});

peerServer.on("disconnect", (client) => {
  console.log("Peer disconnected:", client.getId());
});

console.log("PeerJS server running on port 9000, path:", "/signal");
console.log(peerServer);

const { WebSocketServer } = require("ws");
const { parse } = require("url");

const wss = new WebSocketServer({ port: 10000 });
const rooms = new Map(); // roomId -> Set of clients

// Simple token verification - checks if token is valid Google access token
async function verifyGoogleToken(token) {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return null;
    const userInfo = await response.json();
    return userInfo; // Returns { sub, email, name, picture, ... }
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

wss.on("connection", async (ws, req) => {
  const { pathname, query } = parse(req.url, true);
  const match = pathname.match(/^\/room\/([^/]+)$/);
  if (!match) return ws.close(1008, "Invalid room");

  const roomId = match[1];
  const userId = query.userId;
  const token = query.token;

  if (!userId) return ws.close(1008, "Missing userId");
  if (!token) return ws.close(1008, "Missing token");

  // do the token verification
  const userInfo = await verifyGoogleToken(token);
  if (!userInfo) {
    console.log(`Authentication failed for userId: ${userId}`);
    return ws.close(1008, "Invalid token");
  }

  console.log(`User authenticated: ${userInfo.email} (${userId})`);

  ws.userId = userId;
  ws.token = token;
  ws.userInfo = userInfo;

  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const room = rooms.get(roomId);
  room.add(ws);

  // send joined message to the joined node
  const peers = [...room].map(p => ({ userId: p.userId }));
  ws.send(JSON.stringify({ type: "joined", peers }));

  // handle disconnect
  ws.on("close", () => {
    room.delete(ws);
    const msg = JSON.stringify({ type: "peer-left", userId });
    for (const peer of room) peer.send(msg);
    if (room.size === 0) rooms.delete(roomId);
  });
});

console.log("WebSocket server listening on ws://localhost:10000");
