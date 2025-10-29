import { useState, useRef} from 'react' // A hook that creates a mutable reference object that persists for the full lifetime of the component
import Editor from "@monaco-editor/react"
import * as Y from "yjs" //import yjs library as Y
import { WebrtcProvider } from "y-webrtc" //imports WebrtcProvider class from y-webrtc package
import { MonacoBinding } from "y-monaco"   //imports MonacoBinding class that connects yjs to the Monaco Editor
function App() {
  const editorRef = useRef(null);  //create reference to store a reference to the Monaco Editor Instance
  
  //Initialize YJS, tell it to listen to our Monaco instance for changes

  function handleEditorDidMount(editor, monaco) {  //function that is called when the Monaco Editor is mounted and ready
    editorRef.current = editor;  //stores the editor instance into the reference
    //Initialize YJS
    const doc = new Y.Doc(); // creates a shared document that handles sychronization between clients (this can contain multiple pieces of data)
    const type = doc.getText("monaco"); //get the shared text object from the Yjs document with the key "monaco"(only monaco text is shared) and represent it as type
    const provider = new WebrtcProvider("test-room", doc, { signaling: ["ws://4.155.107.179:4444 "]});   // creates a webRTC provider that sends changes to other clients, define our Azure VM as our signalling server
    //Bind YJS to Monaco
    //Binds the local editor to the shared text
    //what the parameters are: type -> shared yjs document text, editorRef.current.getModel() -> local Monaco Editor's Text model, new Set([editorRef.current]) -> A set containg the shared editor, provider.awareness -> track curosr positions and selections
    const binding = new MonacoBinding(type, editorRef.current.getModel(), new Set([editorRef.current]), provider.awareness) 
    console.log(provider.awareness);
  }

  return (

    //Initialize Monaco Editor
    <Editor
       height = "100vh"
       width = "100vw"
       onMount = {handleEditorDidMount}
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