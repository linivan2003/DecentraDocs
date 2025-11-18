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
const crypto = require("crypto");
const { jwtVerify, createRemoteJWKSet } = require("jose");

const wss = new WebSocketServer({ port: 10000 });
const rooms = new Map(); // roomId -> Set of clients

// config stuff
const DEX_ISSUER = process.env.DEX_ISSUER || "https://dex.emmettlsc.com";
const DEX_CLIENT_ID = process.env.DEX_CLIENT_ID || "decentradocs";
const TURN_SECRET = process.env.TURN_SECRET || "eeeec280850408ea16931ca26d2f6cdf43fa16b65405752a164fb1fa3c35270a";
const TURN_URL = process.env.TURN_URL || "turn.emmettlsc.com";

// JWKS endpoint for Dex
const JWKS = createRemoteJWKSet(new URL(`${DEX_ISSUER}/keys`));

// verify dex's JWT token
async function verifyDexToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: DEX_ISSUER,
      audience: DEX_CLIENT_ID,
    });

    // Return user info with canonical user ID format (iss#sub)
    return {
      userId: `${payload.iss}#${payload.sub}`,
      email: payload.email,
      name: payload.name,
      sub: payload.sub,
      iss: payload.iss,
    };
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return null;
  }
}

// generate TURN credentials w/ HMAC (via coturn API)
function generateTurnCredentials(userId, ttl = 86400) {
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${timestamp}:${userId}`;
  const hmac = crypto.createHmac("sha1", TURN_SECRET);
  hmac.update(username);
  const credential = hmac.digest("base64");

  return {
    username,
    credential,
  };
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

  // Verify the token from Dex
  const userInfo = await verifyDexToken(token);
  if (!userInfo) {
    console.log(`Authentication failed for userId: ${userId}`);
    return ws.close(1008, "Invalid token");
  }

  console.log(`User authenticated: ${userInfo.email} (${userInfo.userId})`);

  ws.userId = userInfo.userId;
  ws.token = token;
  ws.userInfo = userInfo;

  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const room = rooms.get(roomId);
  room.add(ws);

  // generate TURN credentials
  const turnCreds = generateTurnCredentials(userInfo.userId);

  // send joined message with peers and ICE servers
  const peers = [...room]
    .filter(p => p !== ws)
    .map(p => ({
      userId: p.userId,
      displayName: p.userInfo.name || p.userInfo.email
    }));

  const iceServers = [
    {
      urls: [`stun:${TURN_URL}:3478`],
    },
    {
      urls: [`turn:${TURN_URL}:3478`],
      username: turnCreds.username,
      credential: turnCreds.credential,
    },
  ];

  ws.send(JSON.stringify({
    type: "joined",
    peers,
    iceServers
  }));

  // notify other peers about the new peer
  const peerJoinedMsg = JSON.stringify({
    type: "peer-joined",
    userId: userInfo.userId,
    displayName: userInfo.name || userInfo.email,
  });
  for (const peer of room) {
    if (peer !== ws) {
      peer.send(peerJoinedMsg);
    }
  }

  // disconnect
  ws.on("close", () => {
    room.delete(ws);
    const msg = JSON.stringify({ type: "peer-left", userId: userInfo.userId });
    for (const peer of room) peer.send(msg);
    if (room.size === 0) rooms.delete(roomId);
  });
});

console.log("WebSocket server listening on ws://localhost:10000");
