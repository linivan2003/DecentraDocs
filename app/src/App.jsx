import { useState, useMemo, useRef, useEffect} from 'react' // A hook that creates a mutable reference object that persists for the full lifetime of the component
import Editor from "@monaco-editor/react"
import * as Y from "yjs" //import yjs library as Y
import { MonacoBinding } from "y-monaco"   //imports MonacoBinding class that connects yjs to the Monaco Editor
import {IndexeddbPersistence} from "y-indexeddb" //imports IndexeddbPersistence class from y-indexeddb package
import YPJProvider from './YPJProvider.jsx'
import * as awarenessProtocol from 'y-protocols/awareness'

// Color for awareness
function randomColor() {
  const h = Math.floor(Math.random() * 360);
  return `hsl(${h} 90% 60%)`;
}

function App() {
  const roomId = useMemo(() => new URLSearchParams(window.location.search).get('room') || 'test-room', [])
  const myId   = useMemo(() => new URLSearchParams(window.location.search).get('id')    || crypto.randomUUID(), [])
  const peers0 = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get('peers') || ''
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }, [])

  const ydocRef = useRef()
  const awarenessRef = useRef()
  const transportRef = useRef()
  const bindingRef = useRef()

  useEffect(() => {
    const doc = new Y.Doc()
    ydocRef.current = doc
    new IndexeddbPersistence(`doc:${roomId}`, doc)

    const awareness = new awarenessProtocol.Awareness(doc)
    awarenessRef.current = awareness
    awareness.setLocalStateField('user', { name: `User-${Math.floor(Math.random()*1000)}`, color: randomColor() })

   // OIDC-gated discovery WS (make sure this endpoint exists)
   // const token = 'ID_TOKEN'
   // const discoveryWS = new WebSocket(`wss://signal.thisone.work/room/${roomId}?token=${token}`)
   const discoveryWS = null // using URL ?peers=… for now

    // Start PeerJS transport
    transportRef.current = new YPJProvider({
      roomId,
      peerId: myId,                
      initialPeers: peers0,   
      ydoc: doc,
      awareness,
      discoveryWS,
      peerOpts: {
       host: 'signal.thisone.work',
       path: '/peerjs',
       secure: true,
        // TURN/STUN config:
        config: {
          iceServers: [
            { urls: ['stun:stun.l.google.com:19302'] },
          ]
        }
      }
    })

    return () => {
      transportRef.current?.destroy()
      try { discoveryWS?.close() } catch {}
      doc.destroy()
    }
  }, [roomId, myId, peers0])

  function handleEditorDidMount(editor) {
    const ytext = ydocRef.current.getText('monaco')
    bindingRef.current = new MonacoBinding(ytext, editor.getModel(), new Set([editor]), awarenessRef.current)
  }

  function handleEditorWillUnmount() {
    bindingRef.current?.destroy()
    bindingRef.current = null
  }

  return (
    <Editor
      height="100vh"
      width="100vw"
      language="javascript"
      theme="vs-dark"
      options={{ automaticLayout: true }}
      onMount={handleEditorDidMount}
      onWillUnmount={handleEditorWillUnmount}
    />
  )
}

export default App
// High-Level Overview:

// Monaco Editor:
// The text editor frontend

// MonacoBinding
// Translates between Monaco Editor and Yjs
// incoming translates yjs shared text(type) to local editor (editorRef.current)
// outgoing translates local edito(editorRef.current) changes to yjs shared text(type)

// Yjs Document (type)
// Stores the shared text that everyone edits
// constantly updates from local changes and incoming changes from other users

// WebrtcProvider
// Sends changes between users over the internet via the yjs document(doc)
// Listens to doc changes and automatically sends them to other users

// WebRTC (inside WebrtcProvider)
// Creates direct peer-to-peer connections