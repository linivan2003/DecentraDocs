import { useState, useMemo, useRef, useEffect} from 'react' // A hook that creates a mutable reference object that persists for the full lifetime of the component
import Editor from "@monaco-editor/react"
import * as Y from "yjs" //import yjs library as Y
import { MonacoBinding } from "y-monaco"   //imports MonacoBinding class that connects yjs to the Monaco Editor
import {IndexeddbPersistence} from "y-indexeddb" //imports IndexeddbPersistence class from y-indexeddb package
import YPJProvider from './YPJProvider.jsx'
import * as awarenessProtocol from 'y-protocols/awareness'
import { useGoogleLogin } from '@react-oauth/google'

// Color for awareness
function randomColor() {
  const h = Math.floor(Math.random() * 360);
  return `hsl(${h} 90% 60%)`;
}

function App() {
  const [idToken, setIdToken] = useState(localStorage.getItem('id_token') || null)

  const roomId = useMemo(() => new URLSearchParams(window.location.search).get('room') || 'test-room', [])
  const peers0 = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get('peers') || ''
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }, [])

  // NOTE: need to add the hooks here otherwise you get some weird error abt conditional returns??? idk
  const ydocRef = useRef()
  const awarenessRef = useRef()
  const transportRef = useRef()
  const bindingRef = useRef()

  const login = useGoogleLogin({
    onSuccess: async (response) => {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${response.access_token}` }
      })
      const userInfo = await res.json()

      localStorage.setItem('id_token', response.access_token)
      setIdToken(response.access_token)
    },
  })

  useEffect(() => {
    // is user logged in? (need some more thorough checking here...)
    if (!idToken) return

    const myId = new URLSearchParams(window.location.search).get('id') || crypto.randomUUID();
    const doc = new Y.Doc()
    ydocRef.current = doc
    new IndexeddbPersistence(`doc:${roomId}`, doc)

    const awareness = new awarenessProtocol.Awareness(doc)
    awarenessRef.current = awareness
    awareness.setLocalStateField('user', { name: `User-${Math.floor(Math.random()*1000)}`, color: randomColor() })

   // OIDC-gated discovery WS
    const discoveryWS = new WebSocket(`ws://localhost:10000/room/${encodeURIComponent(roomId)}?userId=${encodeURIComponent(myId)}&token=${encodeURIComponent(idToken)}`);

    // Start PeerJS transport
    transportRef.current = new YPJProvider({
      roomId,
      peerId: myId,
      initialPeers: peers0,
      ydoc: doc,
      awareness,
      discoveryWS,
      peerOpts: {
       // non local setup:
       // host: 'signal.thisone.work',
       // path: '/signal',
       // port: 443,
       // secure: true,

       // local testing:
       host: 'localhost',
       path: '/',
       port: 9000,
       secure: false,
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
  }, [roomId, peers0, idToken])

  // Show login if no token (after all hooks are called)
  if (!idToken) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '30px',
        background: '#1e1e1e',
        color: '#fff',
        margin: 0,
        padding: 0
      }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: '600',
          margin: 0,
          letterSpacing: '-0.5px'
        }}>DecentraDocs</h1>
        <p style={{
          fontSize: '18px',
          color: '#a0a0a0',
          margin: 0,
          marginTop: '-10px'
        }}>Collaborative code editor with P2P sync</p>
        <button
          onClick={() => login()}
          style={{
            padding: '14px 32px',
            fontSize: '16px',
            fontWeight: '500',
            background: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(66, 133, 244, 0.3)',
            transition: 'all 0.2s ease',
            marginTop: '10px'
          }}
          onMouseOver={(e) => {
            e.target.style.background = '#357ae8'
            e.target.style.transform = 'translateY(-1px)'
            e.target.style.boxShadow = '0 4px 12px rgba(66, 133, 244, 0.4)'
          }}
          onMouseOut={(e) => {
            e.target.style.background = '#4285f4'
            e.target.style.transform = 'translateY(0)'
            e.target.style.boxShadow = '0 2px 8px rgba(66, 133, 244, 0.3)'
          }}
        >
          Sign in with Google
        </button>
      </div>
    )
  }

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
