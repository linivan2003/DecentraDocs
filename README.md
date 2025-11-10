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
5. SSH to Azure VM
6. start nginx(reverse proxy) with:
```
sudo systemctl start nginx
```
7. start signalling server at opt/peerjs-server
```
node server.js
```


## Testing in Production
1. 1st browser nagivagte to:
https://decentradocs-delta.vercel.app/?room=my-room&id=user1-id

2. 2nd browser navigate to:
https://decentradocs-delta.vercel.app/?room=my-room&id=user2-id&peers=user1-id
