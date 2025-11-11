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

wss.on("connection", (ws, req) => {
  const { pathname, query } = parse(req.url, true);
  const match = pathname.match(/^\/room\/([^/]+)$/);
  if (!match) return ws.close(1008, "Invalid room");

  const roomId = match[1];
  const userId = query.userId;
  const token = query.token;
  if (!userId) return ws.close(1008, "Missing userId");

  ws.userId = userId;
  ws.token = token;

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
