import Peer from 'peerjs'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'
import { applyUpdate } from 'yjs'

class YPJProvider {
  constructor({ roomId, peerId, initialPeers = [], ydoc, awareness, peerOpts, discoveryWS }) {
    this.roomId = roomId
    this.doc = ydoc
    this.awareness = awareness || new Awareness(ydoc)
    this.conns = new Map()
    this.ready = false
    this.peerId = peerId ? peerId : null

    // 1) Start PeerJS (with or without explicit id)
    this.peer = peerId ? new Peer(peerId, { debug: 0, ...peerOpts })
                       : new Peer({ debug: 0, ...peerOpts })

    // peer open -> we now know our id
    this.peer.on('open', (id) => {
      this.peerId = id
      this.ready = true
      // dial initial peers (e.g., from URL ?peers=…)
      initialPeers.filter(p => p && p !== id).forEach(p => this.dial(p))
    })

    this.peer.on('error', (err) => console.error('[peerjs] error', err))

    // inbound connections
    this.peer.on('connection', (conn) => this.attach(conn))

    // 2) Yjs updates
    this.doc.on('update', (u) => this.broadcast(u))

    // 3) Awareness (throttled)
    let scheduled = false
    this.awareness.on('update', ({ added, updated, removed }) => {
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        const ids = added.concat(updated).concat(removed)
        const u = encodeAwarenessUpdate(this.awareness, ids)
        this.broadcast(this.tagAware(u))
      })
    })

    // 4) Discovery WS (OIDC room service)
    if (discoveryWS) {
      discoveryWS.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data || '{}')
        if (msg.type === 'joined' && Array.isArray(msg.peers)) {
          msg.peers.map(p => p.userId).filter(id => id && id !== this.peerId)
            .forEach(id => this.dial(id))
        } else if (msg.type === 'peer-joined' && msg.userId && msg.userId !== this.peerId) {
          this.dial(msg.userId)
        } else if (msg.type === 'peer-left' && msg.userId) {
          this.drop(msg.userId)
        }
      })
    }
  }

  dial(id) {
    if (!this.ready) { setTimeout(() => this.dial(id), 50); return }
    if (this.conns.has(id) || id === this.peerId) return
    const conn = this.peer.connect(id, { reliable: true, serialization: 'binary' })
    this.attach(conn)
  }

  attach(conn) {
    const id = conn.peer
    this.conns.set(id, conn)

    conn.on('open', () => {
      // cold-start sync: send full state + current awareness
      try { conn.send(Y.encodeStateAsUpdate(this.doc)) } catch {}
      const ids = Array.from(this.awareness.getStates().keys())
      if (ids.length) {
        const u = encodeAwarenessUpdate(this.awareness, ids)
        try { conn.send(this.tagAware(u)) } catch {}
      }
    })

    conn.on('data', (data) => {
      if (data instanceof ArrayBuffer) {
        const u8 = new Uint8Array(data)
        if (u8[0] === 0xA5) applyAwarenessUpdate(this.awareness, u8.slice(1), this)
        else applyUpdate(this.doc, u8)
      } else {
        console.warn('non-binary frame', typeof data)
      }
    })

    conn.on('close', () => this.drop(id))
    conn.on('error', (e) => { console.error('[peerjs] conn error', id, e); this.drop(id) })
  }

  broadcast(buf) {
    for (const [, c] of this.conns) if (c.open) { try { c.send(buf) } catch {} }
  }

  tagAware(buf) {
    const out = new Uint8Array(buf.length + 1)
    out[0] = 0xA5; out.set(buf, 1); return out
  }

  drop(id) {
    const c = this.conns.get(id)
    try { c?.close() } catch {}
    this.conns.delete(id)
  }

  destroy()  {
    for (const [, c] of this.conns) try { c.close() } catch {}
    this.conns.clear()
    try { this.peer.destroy() } catch {}
  }
}

export default YPJProvider
