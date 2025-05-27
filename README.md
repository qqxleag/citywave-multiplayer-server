# City Wave Multiplayer Server

WebSocket server for City Wave game multiplayer functionality.

## Features

- Real-time player communication
- Location-based chat rooms
- Player movement synchronization
- Player join/leave events

## Environment Variables

- `PORT` - Server port (default: 8080)

## Deployment

This server is designed to be deployed on Railway.

### Deploy to Railway

1. Connect your GitHub repository to Railway
2. Railway will automatically detect the Node.js project
3. The server will start using the `npm start` command

## Development

```bash
npm install
npm run dev
```

## Production

```bash
npm install --production
npm start
```
