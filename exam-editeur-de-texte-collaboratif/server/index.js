const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const PORT = 3000;
const app = express();
const server = http.createServer(app);
// Initialise Socket.IO en lui passant le serveur HTTP
const io = new Server(server);


// ------------------------------------------------------------------
// Stockage en Mémoire 
const users = new Map();     
const roomsData = new Map();
const roomsTokens = new Map();
// compteur d'événements pour les logs
let eventCount = 0;         

// Fonction pour générer des tokens 
function generateToken(length = 8) {
    console.log("Génération d'un nouveau token.");
    return Math.random().toString(36).substring(2, 2 + length);
}

// pour recup le fichier index.html depuis le dossier client/ et pas en racine
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// une route pour générer ou récupérer le token d'une room
app.post('/api/join', (req, res) => {
    console.log("body", req.body);
    const { roomName } = req.body;
    console.log("body", roomName);
    if (!roomName) {
        return res.status(400).json({ error: "Le nom de la room est requis." });
    }
    let token;
    let isNew = false;
    // on check si y a déjà un token pour cette room
    if (roomsTokens.has(roomName)) {
        console.log("Room existante, récupération du token.");
        token = roomsTokens.get(roomName);
    } else {
        console.log("Room inconnue, création d'une nouvelle room et d'un token.");
        // si pas, on en crée un nouveau
        token = generateToken();
        roomsTokens.set(roomName, token);
        roomsData.set(roomName, { content: '', users: [] });
        isNew = true;

        console.log(`[ROOM CRÉÉE] ${roomName} avec token: ${token}`);
    }

    res.json({ roomName, token, isNew });
});

// ------------------------------------------------------------------
// la sécurité avec les tokens
io.use((socket, next) => {
    // on récupère pseudo et room depuis la query (transmis par le client)
    const { pseudo, room, token} = socket.handshake.query;

    // si un des paramètres de base est manquant on refuse la connexion
    if (!pseudo || !room || !token) {
        return next(new Error("Paramètres de connexion manquants (pseudo, room, token)."));
    }

    const expectedToken = roomsTokens.get(room);
    // on vérifie le token
    if (!expectedToken || expectedToken !== token) {
        console.warn(`[AUTH REFUSÉE] Room: ${room}, Token fourni: ${token}`);
        return next(new Error(`Token Invalide ou Room inexistante pour ${room}.`));
    }

    // si on a tout, on attache les infos au socket pour les utiliser plus tard
    socket.pseudo = pseudo;
    socket.room = room;
    next();
});

// on écoute les connexions des clients
io.on('connection', (socket) => {
    const { pseudo, room } = socket; 

    socket.join(room);

    // add l'user à notre liste (avec la room qu'il rejoint)
    users.set(socket.id, { pseudo, room });
    // si la room n'existe pas encore, on la crée
    if (!roomsData.has(room)) {
        roomsData.set(room, { content: '', users: [] });
    }
    const currentRoomData = roomsData.get(room);
    // add l'user à la liste de la room
    currentRoomData.users.push(pseudo); 
    
    console.log(`[CONNEXION] ${pseudo} a rejoint la room: ${room}`);

    // on envoie notre contenu actuel au nouvel arrivant (pour synchro)
    socket.emit('update', currentRoomData.content);
    // crée la liste des users dans la room (pour les notifs)
    const userList = currentRoomData.users;
    // on send la notif de connexion du nouveau aux users de la room
    socket.to(room).emit('notification', {
        type: 'join',
        message: `${pseudo} a rejoint la session.`,
        userList: userList // update la liste
    });
    
    // message pour le nouveau (pas les autres)
    socket.emit('notification', {
        type: 'initial',
        message: `Bienvenue dans la room ${room}.`,
        userList: userList
    });


    // pour les déconnexions
    socket.on('disconnect', () => {
        if (!users.has(socket.id)) {
            return
        };
        const { pseudo, room } = users.get(socket.id);
        users.delete(socket.id);
        const roomData = roomsData.get(room);
        if (roomData) {
            roomData.users = roomData.users.filter(u => u !== pseudo);
            
            if (roomData.users.length === 0) {
                roomsData.delete(room);
            }
        }
        console.log(`[DÉCONNEXION] ${pseudo} a quitté la room: ${room}`);

        // notifi les autres de la déco
        const updatedUserList = roomData ? roomData.users : [];
        // on utilise "socket" et pas "io" pour envoyer à tous SAUF celui qui part
        socket.to(room).emit('notification', { 
            type: 'leave',
            message: `${pseudo} a quitté la session.`,
            userList: updatedUserList
        });
    });

    // pour les mises à jour 
    socket.on('update', (newContent) => {
        const { pseudo, room } = socket;
        
        // update en mémoire de la room
        const roomData = roomsData.get(room);
        if (roomData) {
            roomData.content = newContent;
        }

        // on envoie la mise à jour a tlm (sauf l'émetteur)
        socket.to(room).emit('update', newContent);
        eventCount++; 
        console.log(`[UPDATE] Room ${room} - ${pseudo} a modifié le contenu.`);
    });
});


// ------------------------------------------------------------------
// Route et monitoring des stats

// route pour voir le status du serveur
app.get('/status', (req, res) => {
    const activeRooms = Array.from(roomsData.keys());
    res.json({
        status: 'OK',
        activeConnections: users.size,
        rooms: activeRooms.map(room => ({
            name: room,
            users: roomsData.get(room).users,
            contentPreview: roomsData.get(room).content.substring(0, 50) + (roomsData.get(room).content.length > 50 ? '...' : '')
        })),
        eventsPerMinute: eventCount 
    });
});

// log des stats toutes les minutes en console
setInterval(() => {
    const activeRooms = Array.from(roomsData.keys());
    const eventsPerMinute = eventCount;
    eventCount = 0;

    console.log('--- STATS MONITORING ---');
    console.log(`Connections Actives: ${users.size}`);
    console.log(`Événements 'update' / min: ${eventsPerMinute}`);
    console.log(`Rooms Actives (${activeRooms.length}): ${activeRooms.join(', ')}`);
    console.log('------------------------');
}, 60000); 



server.listen(PORT, () => {
  console.log(`🚀 Serveur CollabBoard démarré sur http://localhost:${PORT}`);
  console.log(`Accès aux stats : http://localhost:${PORT}/status`);
});
