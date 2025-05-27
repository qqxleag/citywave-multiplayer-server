const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class MultiplayerServer {
    constructor(port = process.env.PORT || 8080) {
        this.port = port;
        this.players = new Map(); // Store all connected players
        this.rooms = new Map(); // Store room-specific data (for different locations)
        
        this.initializeServer();
    }
    
    initializeServer() {
        this.wss = new WebSocket.Server({ 
            port: this.port,
            perMessageDeflate: false 
        });
        
        console.log(`🚀 Multiplayer server started on port ${this.port}`);
        console.log(`📍 Players can connect to ws://localhost:${this.port}`);
        
        this.wss.on('connection', (ws, req) => {
            this.handleNewConnection(ws, req);
        });
        
        // Cleanup disconnected players every 30 seconds
        setInterval(() => {
            this.cleanupDisconnectedPlayers();
        }, 30000);
        
        // Log stats every minute
        setInterval(() => {
            this.logServerStats();
        }, 60000);
    }
    
    handleNewConnection(ws, req) {
        const playerId = uuidv4();
        const clientIP = req.socket.remoteAddress;
        
        console.log(`👤 New connection: ${playerId} from ${clientIP}`);
        
        // Initialize player object
        const player = {
            id: playerId,
            ws: ws,
            data: null,
            location: 'Park', // Default location for multiplayer
            lastActivity: Date.now(),
            ip: clientIP
        };
        
        this.players.set(playerId, player);
        
        // Set up WebSocket event handlers
        ws.on('message', (message) => {
            this.handlePlayerMessage(playerId, message);
        });
        
        ws.on('close', () => {
            this.handlePlayerDisconnect(playerId);
        });
        
        ws.on('error', (error) => {
            console.error(`❌ WebSocket error for player ${playerId}:`, error);
            this.handlePlayerDisconnect(playerId);
        });
        
        // Send welcome message
        this.sendToPlayer(playerId, {
            type: 'connection_established',
            data: { playerId: playerId }
        });
    }
    
    handlePlayerMessage(playerId, rawMessage) {
        try {
            const message = JSON.parse(rawMessage.toString());
            const player = this.players.get(playerId);
            
            if (!player) {
                console.warn(`⚠️ Received message from unknown player: ${playerId}`);
                return;
            }
            
            player.lastActivity = Date.now();
            
            console.log(`📨 Message from ${playerId}: ${message.type}`);
            
            switch (message.type) {
                case 'player_join':
                    this.handlePlayerJoin(playerId, message.data);
                    break;
                    
                case 'player_leave':
                    this.handlePlayerLeave(playerId);
                    break;
                    
                case 'chat_message':
                    this.handleChatMessage(playerId, message.data);
                    break;
                    
                case 'player_move':
                    this.handlePlayerMove(playerId, message.data);
                    break;
                    
                default:
                    console.warn(`⚠️ Unknown message type: ${message.type}`);
                    this.sendToPlayer(playerId, {
                        type: 'error',
                        data: { message: 'Unknown message type' }
                    });
            }
            
        } catch (error) {
            console.error(`❌ Error parsing message from ${playerId}:`, error);
            this.sendToPlayer(playerId, {
                type: 'error',
                data: { message: 'Invalid message format' }
            });
        }
    }
    
    handlePlayerJoin(playerId, playerData) {
        const player = this.players.get(playerId);
        if (!player) return;
        
        // Store player data
        player.data = {
            ...playerData,
            id: playerId, // Use server-generated ID
            joinTime: Date.now()
        };
        
        console.log(`✅ Player joined: ${player.data.nickname} (${playerId})`);
        
        // Send current player list to the new player
        const otherPlayers = this.getPlayersInLocation(player.location, playerId);
        this.sendToPlayer(playerId, {
            type: 'player_list',
            data: otherPlayers.map(p => p.data)
        });
        
        // Notify other players about the new player
        this.broadcastToLocation(player.location, {
            type: 'player_joined',
            data: player.data
        }, playerId);
    }
    
    handlePlayerLeave(playerId) {
        const player = this.players.get(playerId);
        if (!player || !player.data) return;
        
        console.log(`👋 Player leaving: ${player.data.nickname} (${playerId})`);
        
        // Notify other players
        this.broadcastToLocation(player.location, {
            type: 'player_left',
            data: { 
                id: playerId,
                nickname: player.data.nickname 
            }
        }, playerId);
        
        // Remove player
        this.players.delete(playerId);
    }
    
    handlePlayerDisconnect(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            console.log(`🔌 Player disconnected: ${playerId}`);
            
            if (player.data) {
                // Notify other players
                this.broadcastToLocation(player.location, {
                    type: 'player_left',
                    data: { 
                        id: playerId,
                        nickname: player.data.nickname 
                    }
                }, playerId);
            }
            
            this.players.delete(playerId);
        }
    }
    
    handleChatMessage(playerId, messageData) {
        const player = this.players.get(playerId);
        if (!player || !player.data) return;
        
        // Validate message
        if (!messageData.text || messageData.text.trim().length === 0) {
            return;
        }
        
        // Limit message length
        const text = messageData.text.trim().substring(0, 200);
        
        console.log(`💬 Chat from ${player.data.nickname}: ${text}`);
        
        // Add timestamp and player info
        const chatMessage = {
            type: 'chat_message',
            data: {
                playerId: playerId,
                username: player.data.username,
                nickname: player.data.nickname,
                text: text,
                timestamp: Date.now()
            }
        };
        
        // Broadcast to all players in the same location
        this.broadcastToLocation(player.location, chatMessage, playerId);
    }
    
    handlePlayerMove(playerId, moveData) {
        const player = this.players.get(playerId);
        if (!player || !player.data) return;
        
        // Validate coordinates
        const x = Math.max(0, Math.min(100, parseFloat(moveData.x) || 0));
        const y = Math.max(0, Math.min(100, parseFloat(moveData.y) || 0));
        
        // Update player position
        player.data.x = x;
        player.data.y = y;
        
        // Broadcast movement to other players
        this.broadcastToLocation(player.location, {
            type: 'player_moved',
            data: {
                id: playerId,
                x: x,
                y: y
            }
        }, playerId);
    }
    
    sendToPlayer(playerId, message) {
        const player = this.players.get(playerId);
        if (player && player.ws.readyState === WebSocket.OPEN) {
            try {
                player.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error(`❌ Error sending message to ${playerId}:`, error);
                this.handlePlayerDisconnect(playerId);
            }
        }
    }
    
    broadcastToLocation(location, message, excludePlayerId = null) {
        const players = this.getPlayersInLocation(location, excludePlayerId);
        
        players.forEach(player => {
            this.sendToPlayer(player.id, message);
        });
    }
    
    getPlayersInLocation(location, excludePlayerId = null) {
        const players = [];
        
        for (const [playerId, player] of this.players) {
            if (playerId === excludePlayerId) continue;
            if (player.location === location && player.data) {
                players.push(player);
            }
        }
        
        return players;
    }
    
    cleanupDisconnectedPlayers() {
        const now = Date.now();
        const timeout = 5 * 60 * 1000; // 5 minutes
        
        for (const [playerId, player] of this.players) {
            if (player.ws.readyState !== WebSocket.OPEN || 
                (now - player.lastActivity) > timeout) {
                console.log(`🧹 Cleaning up inactive player: ${playerId}`);
                this.handlePlayerDisconnect(playerId);
            }
        }
    }
    
    logServerStats() {
        const totalPlayers = this.players.size;
        const activePlayers = Array.from(this.players.values())
            .filter(p => p.data).length;
        
        console.log(`📊 Server stats: ${activePlayers}/${totalPlayers} active players`);
        
        // Log players by location
        const locationStats = {};
        for (const player of this.players.values()) {
            if (player.data) {
                locationStats[player.location] = (locationStats[player.location] || 0) + 1;
            }
        }
        
        if (Object.keys(locationStats).length > 0) {
            console.log('📍 Players by location:', locationStats);
        }
    }
    
    shutdown() {
        console.log('🛑 Shutting down multiplayer server...');
        
        // Notify all players
        for (const [playerId, player] of this.players) {
            this.sendToPlayer(playerId, {
                type: 'server_shutdown',
                data: { message: 'Server is shutting down' }
            });
        }
        
        // Close all connections
        this.wss.close(() => {
            console.log('✅ Server shutdown complete');
        });
    }
}

// Create and start the server
const server = new MultiplayerServer();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⚠️ Received SIGINT, shutting down gracefully...');
    server.shutdown();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n⚠️ Received SIGTERM, shutting down gracefully...');
    server.shutdown();
    process.exit(0);
});

module.exports = MultiplayerServer;
