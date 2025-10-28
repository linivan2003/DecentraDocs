import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import Editor from "@monaco-editor/react"

function App() {
  const [count, setCount] = useState(0)

  return (
    //Initialize Monaco Editor on Website
    <Editor
       height = "100vh"
       width = "100vw"
      />
  )
}

export default App
