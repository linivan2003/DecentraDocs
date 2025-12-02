import { useEffect } from 'react'
import { handleCallback } from './auth'

function Callback() {
  useEffect(() => {
    handleCallback()
      .then(user => {
        console.log('Authentication successful:', user)
        // Redirect to main app
        window.location.href = '/'
      })
      .catch(error => {
        console.error('Authentication failed:', error)
        // Redirect to main app anyway (will show login screen)
        window.location.href = '/'
      })
  }, [])

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1e1e1e',
      color: '#fff'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2>Authenticating...</h2>
        <p style={{ color: '#a0a0a0' }}>Please wait while we complete your login</p>
      </div>
    </div>
  )
}

export default Callback
