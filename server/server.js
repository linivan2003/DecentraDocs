const { PeerServer } = require("peer");

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