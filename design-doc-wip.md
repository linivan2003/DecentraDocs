# Design Document (Network Part)
---
https://www.inkandswitch.com/essay/local-first/

https://yjs.dev/

https://github.com/yjs/yjs-demos/tree/main/monaco [this is a demo app]

# Notice before reading
Understanding the following design sketches requires some basic knowledge about the following bullets:
* Single Sign-On (SSO),
* HMAC signature, 
* STUN/TURN, 
* WebSocket, 
* OpenIDConnect (OIDC), and 
* WebRTC. 

None of them is complicated, you can learn by yourself or via disussions in this group.  Please also keep in mind that what is documented here is work in progress.  Please fee free to shoot questions to tianyuan@cs.ucla.edu

## **High-Level Architecture**
```text
Client ── OIDC Auth ──▶ IdP
  │                       ▲
  ▼                       │  JWKS
Signaling (WS/REST) ──────┘  (verify JWT)
   │ Admit if allowlisted
   │
   ├─▶ Relay SDP/ICE within room
   │
   └─▶ Issue short-lived STUN/TURN creds (only if allowlisted)

Client ◀── WebRTC ICE (STUN/TURN) ──▶ TURN/STUN Server
Client ◀────────── P2P WebRTC (DTLS/SCTP) ──────────▶ Client
```
- Note: STUN/TURN and the Signaling can be two Docker containers, with two different DNS names.
---

## 1. System Workflow
**1.	Login:** User authenticates via OIDC (e.g., Google) and receives an ID Token (JWT).

**2.	Join Room:** Client connects to ``wss://signal.example.com/room/{roomId}?token={ID_TOKEN}``. Signaling verifies token via IdP's JWKS and checks allowlist.

**3.	Get ICE Servers:**  If admitted, signaling issues short-lived STUN/TURN credentials (HMAC-based).

**4.	Exchange SDP & ICE:** Clients exchange session offers/answers and ICE candidates through signaling.

**5.	Run ICE:** Each peer discovers network candidates using authenticated STUN/TURN.

**6.	Establish DTLS:**  Peers verify DTLS fingerprints advertised in SDP (mutual authentication).

**7.	Open DataChannel:** All peer-to-peer traffic runs over DTLS-SCTP thus go fully end-to-end encrypted.

**8.	Heartbeat:** Peers send ping/pong to maintain session.


## **2. System Roles**

**Initiator / Admin**  
- Creates and manages rooms.  
- Defines allowlists of authorized user IDs.

**Signaling Service**  
- Authenticates users via OIDC ID Tokens.  
- Enforces allowlists before admitting users.  
- Relays SDP offers/answers and ICE candidates (no data relay, which is provided by TURN if needed).  
- Issues short-lived STUN/TURN credentials to allowlisted users.  

**TURN / STUN Service**  
- Provides NAT traversal (TURN as last resort).  
- Accepts only HMAC-based credentials issued by signaling.  
- Shares a static HMAC secret with signaling.

**OIDC Identity Provider (IdP)**  
- Authenticates users and issues signed ID Tokens (JWT).  
- Exposes JWKS for signature verification.  

**Clients**  
- Obtain ID Tokens via OIDC.  
- Connect to Signaling via WebSocket.  
- Establish P2P WebRTC connections using ICE servers from the TURN policy.  
---

## **3. Trust Model**

- **Authentication:** Verified via OIDC ID Token (validated against IdP's JWKS).  
- **Authorization:** Controlled by initiator's allowlist (per room or global).  
- **STUN/TURN:** The same allowlist governs who can obtain valid credentials.  
- **No Insider Attack:** Authenticated and authorized users won't attack, e.g., impersonate others

---

## **4. AuthT and AuthZ in Peer-to-Peer WebRTC**
- **Each peer generates a self-signed DTLS certificate and publishes its fingerprint (SHA-256) in the SDP offer/answer (note: most WebRTC libraires already do this for you when genearting a SDP message)**.
- When peers exchange SDP through the signaling server, each records the expected fingerprint of its counterpart. That is, peer need to maintain a list of "authenticated" fingerprints.
- During the DTLS handshake, each peer verifies that the received certificate matches the advertised fingerprint (note: most WebRTC libraires already do this)
- **If fingerprints mismatch, the connection fails (note: most WebRTC libraires already do this)**.

---

## **5. Signaling Protocol and API**

**Connection:**  
`wss://signal.example.com/room/{roomId}?token={ID_TOKEN}`  

This WebSocket endpoint establishes a bidirectional signaling channel between a verified client and the signaling service.  
`{roomId}` identifies the collaborative session, and `{ID_TOKEN}` authenticates the user via OIDC.

---

### **5.1 Admission Flow**
1. **Token Verification** — Validate the JWT via JWKS:
   - Verify signature (`RS256` or equivalent).  
   - Check required claims: `iss`, `aud`, `sub`, `exp`, `nbf`.  
   - Ensure token not expired.  
2. **User Mapping** — Canonical userId = `iss#sub`. For example: ``https://accounts.google.com#9988776655``
3. **Authorization** — Check that user is in the room's allowlist.  
4. **Admission** — If authorized:
   - Add user to in-memory registry.  
   - Notify existing peers via `peer-joined`.  
   - Send `joined` message with `peers[]` and `iceServers[]`.

---

### **5.2 Message Types**
| Direction | Type | Purpose | Payload |
|------------|------|----------|----------|
| C→S | `offer` | Forward SDP offer | `{ from, to, sdp }` |
| C→S | `answer` | Forward SDP answer | `{ from, to, sdp }` |
| C→S | `ice` | Relay ICE candidate | `{ from, to, candidate }` |
| C→S | `ping` | Heartbeat | — |
| S→C | `joined` | Admission confirmation | `{ peers[], iceServers[] }` |
| S→C | `peer-joined` | Notify new peer | `{ userId, displayName }` |
| S→C | `peer-left` | Notify peer left | `{ userId }` |
| S→C | `offer` / `answer` | Relay peer’s SDP | `{ from, to, sdp }` |
| S→C | `ice` | Relay peer's ICE | `{ from, to, candidate }` |
| S→C | `pong` | Heartbeat reply | — |
| S→C | `error` | Admission/runtime error | `{ code, message }` |

**Notes:**  
- `to` and `from` are canonical OIDC user IDs.  
- `candidate` and `sdp` uses standard WebRTC ICE syntax.
- See later examples for `peers[]` and `iceServers[]`

---

### **5.3 Example Messages**

**Joined**
```json
{
  "type": "joined",
  "peers": [
    { "userId": "https://accounts.google.com#9988776655", "displayName": "Alice" },
    { "userId": "https://login.microsoftonline.com#abc123", "displayName": "Bob" }
  ],
  "iceServers": [
    {
      "urls": ["stun:signal.example.com:3478"],
      "credential": "base64(HMAC(secret, userId))"
    },
    {
      "urls": ["turns:signal.example.com:5349?transport=tcp"],
      "credential": "base64(HMAC(secret, userId))"
    }
  ]
}
```
**Notes: `secret` is a shared secret between the STUN/TURN module and the authentication module of WebRTC (for example, two Docker containers). The TURN/STUN server. how we exactly we authorize users calling STUN/TURN also subject to the actual STUN/TURN [library](https://github.com/coturn/coturn) we use. But basic ideas should be the same.**

* An example of `offer` is
```
{
  "type": "offer",
  "to": "https://accounts.google.com#9988776655",
  "sdp": "v=0\r\no=- 4962326 2 IN IP4 127.0.0.1\r\n..."
}
```
**Note: when you call `createOffer()` from WebRTC libraries, it should give you the raw `sdp`.**
* An example of `answer` is
```
{
  "type": "answer",
  "from": "https://login.microsoftonline.com#abc123",
  "sdp": "v=0\r\no=- 912344 2 IN IP4 127.0.0.1\r\n..."
}
```
* An example of `ice` is
```
{
  "type": "ice",
  "to": "https://accounts.google.com#9988776655",
  "candidate": {
    "candidate": "candidate:1 1 udp 2122260223 192.0.2.5 54400 typ host",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```
**Notes: most WebRTC libraries would autofill the ``candidate`` field once you configure them the STUN/TURN servers and call the corresponding APIs. That is, you don't need to run STUN/TURN protocol yourself, but need to setup servers.**

### **5.4 Message Semantics**
All messages include `to` or `from` identifiers; the server uses them to route within the same `roomId`. The server never inspects or alters SDP or ICE payloads—only passes them through verbatim.

**Error Codes and Messages:**
  - `UNAUTHORIZED`: Token invalid or expired  
  - `FORBIDDEN`:  User not allowlisted 
  - `BAD_MESSAGE`:  Malformed JSON or oversized payload  
  - `INTERNAL_ERROR`: Unexpected exception  

---

### **4.5 Heartbeat & Connection Management**

- Clients must send `ping` every 30 seconds (configurable).  
- Server replies with `pong`; if no heartbeat within timeout (e.g., 90 s), the connection is dropped and **the server broadcasts a `peer-left`**.
- On reconnect, the client re-authenticates with a fresh ID Token and rejoins the same room (state reconstruction is client-side).

### **Appendix: Requirment of OIDC Usage**

- Required claims: `iss`, `aud`, `sub`, `exp`
- Use dedicated OIDC audience for this app.
