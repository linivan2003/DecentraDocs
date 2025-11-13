# DecentraDocs - Monaco Editor App

A React application built with Vite featuring Monaco Editor.

## Prerequisites
- Node.js (version 24 or higher)
- npm (version 11 or higher)

## Getting Started

1. Clone the repository
2. Navigate to the app directory: `cd app`
3. Install dependencies: `npm install`
4. Start the development server: `npm run dev`

### Note: If servers are for some reason not running:
restart nginx(reverse proxy) with:
```
sudo systemctl start nginx
```
restart signalling server at opt/peerjs-server
```
pm2 restart server.js
```


## Testing in Production
1. 1st browser nagivagte to:
https://decentradocs-delta.vercel.app/?room=test-room

2. 2nd browser navigate to:
https://decentradocs-delta.vercel.app/?room=test-room
