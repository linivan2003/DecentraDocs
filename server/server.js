const { PeerServer } = require("peer");
const WebSocket = require("ws");
const url = require("url");

const peerServer = PeerServer({
  port: 9000,
  path: "/",   // keep to this because nginx strips the "/signal" portion
  proxied: true,
});

peerServer.on("connection", (client) => {
  console.log("New peer:", client.getId());
});

peerServer.on("disconnect", (client) => {
  console.log("Peer disconnected:", client.getId());
});

console.log("PeerJS server running on port 9000, path:", "/signal");

// WebSocket Discovery Server on port 10000
const wss = new WebSocket.Server({ port: 10000 });

// Store rooms: roomId -> Set of WebSocket connections
const rooms = new Map();

// Helper to parse room path and query params
function parseRequest(req) {
  const parsed = url.parse(req.url, true);
  const pathMatch = parsed.pathname.match(/^\/room\/(.+)$/);
  const roomId = pathMatch ? decodeURIComponent(pathMatch[1]) : null;
  const userId = parsed.query.userId ? decodeURIComponent(parsed.query.userId) : null;
  const token = parsed.query.token ? decodeURIComponent(parsed.query.token) : null;
  return { roomId, userId, token };
}

wss.on("connection", (ws, req) => {
  const { roomId, userId, token } = parseRequest(req);
  
  if (!roomId) {
    ws.close(1008, "Invalid room path");
    return;
  }

  console.log(`Discovery client connected: room=${roomId}, userId=${userId}`);

  // Store userId and roomId on the WebSocket
  ws.roomId = roomId;
  ws.userId = userId;
  ws.token = token;

  // Get or create room
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  const room = rooms.get(roomId);

  // Get current peers in room (excluding self)
  const currentPeers = Array.from(room)
    .map(peer => ({ userId: peer.userId }))
    .filter(p => p.userId && p.userId !== userId);

  // Add this peer to the room
  room.add(ws);

  // Send "joined" message with current peers
  ws.send(JSON.stringify({
    type: "joined",
    peers: currentPeers
  }));

  // Broadcast "peer-joined" to all other peers in the room
  room.forEach(peer => {
    if (peer !== ws && peer.readyState === WebSocket.OPEN) {
      peer.send(JSON.stringify({
        type: "peer-joined",
        userId: userId
      }));
    }
  });

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      // Handle any additional message types if needed
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    } catch (error) {
      console.error("Error handling discovery message:", error);
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.roomId);
    if (room) {
      room.delete(ws);
      
      // If room is empty, clean it up
      if (room.size === 0) {
        rooms.delete(ws.roomId);
      } else {
        // Broadcast "peer-left" to remaining peers
        room.forEach(peer => {
          if (peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({
              type: "peer-left",
              userId: ws.userId
            }));
          }
        });
      }
    }
    console.log(`Discovery client disconnected: room=${ws.roomId}, userId=${ws.userId}`);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

console.log("PeerJS server running on port 9000, path:", "/signal");
console.log("WebSocket discovery server running on port 10000");