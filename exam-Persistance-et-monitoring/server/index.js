const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { type } = require('os');
const sqlite3 = require('sqlite3').verbose();

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
// contrôle de la fréquence de maj
const updateTimestamps = new Map(); // pour stocker les timestamps des derniers updates
const UPDATE_INTERVAL = 50; // 50 ms entre les updates

// path de ma db
const DB_PATH = path.join(__dirname, 'collabboard.db');

// db sqlite
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("Erreur à l'ouverture de la base de données", err.message);
    } 
    else 
    {
        console.log("Connecté à la base de données SQLite.");
        db.run(`
            CREATE TABLE IF NOT EXISTS rooms (
                roomName TEXT PRIMARY KEY,
                content TEXT,
                token TEXT NOT NULL DEFAULT '' -- AJOUTER LA COLONNE TOKEN
            )
        `, (err) => {
            if (err) {
                console.error("Erreur lors de la création de la table 'rooms':", err.message);
            } else {
                console.log("Table 'rooms' vérifiée/créée.");
                
                // charge tokens existants en mémoire au start du serv pour la reco auto
                db.all("SELECT roomName, token FROM rooms WHERE token IS NOT ''", [], (err, rows) => {
                    if (err) {
                        console.error("Erreur lors du chargement des tokens:", err.message);
                        return;
                    }
                    rows.forEach(row => {
                        roomsTokens.set(row.roomName, row.token);
                    });
                    console.log(`Tokens de ${rows.length} room(s) chargés en mémoire.`);
                });
            }
        });
    }
    
});


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
    const { roomName } = req.body;
    if (!roomName) {
        return res.status(400).json({ error: "Le nom de la room est requis." });
    }
    // on check si y a déjà un token pour cette room en db
    db.get(`SELECT content FROM rooms WHERE roomName = ?`, [roomName], (err, row) => {
        if (err) {
            console.error("Erreur lors de la requête de la room:", err.message);
            return res.status(500).json({ error: "Erreur serveur lors de la récupération de la room." });
        }
        let token;
        let isNew = false;

        if (row)
        {
            // mémoire ou db
            token = roomsTokens.get(roomName) || row.token; 
            
            if (!token) { 
                token = generateToken();
                roomsTokens.set(roomName, token);
                db.run("UPDATE rooms SET token = ? WHERE roomName = ?", [token, roomName], (err) => {
                    if (err) console.error("Erreur d'update de token:", err.message);
                });
            } else {
                roomsTokens.set(roomName, token);
            }
            console.log("Room existante, token récupéré/mis à jour.");
        }
        else
        {
            console.log("Room inconnue, création d'une nouvelle room et d'un token.");
            // si pas, on en crée un nouveau
            isNew = true;
            token = generateToken();
            roomsTokens.set(roomName, token);
            db.run(`INSERT INTO rooms (roomName, content, token) VALUES (?, ?, ?)`, [roomName, '', token], (err) => {
                if (err) {
                    console.error("Erreur lors de la création de la nouvelle room:", err.message);
                }
                else
                {
                    console.log(`[ROOM CRÉÉE] ${roomName} et INSÉRÉE en DB.`);
                }
            });
        }
    res.json({ roomName, token, isNew });
    });
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

    // sanitisation du pseudo
    socket.pseudo = sanitizeInput(pseudo);
    if (!socket.pseudo) {
        return next(new Error("Pseudo invalide."));
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

    db.get(`SELECT content FROM rooms WHERE roomName = ?`, [room], (err, row) => 
    {
        if (err) 
        {
            console.error("Erreur lors de la récupération du contenu de la room:", err.message);
        }
        else 
        {
            content = row ? row.content : '';
        }
        // envoie le contenu actuel de la room au client
        socket.emit('update', content); 

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
        updateTimestamps.delete(socket.id);
    });


    // pour les mises à jour 
    socket.on('update', (newContent) => {
        const { pseudo, room } = socket;
        
        // on vérifie la taille du contenu
        if (newContent.length > 100000) 
        {
            console.warn(`[VILAINE ACTION] Contenu trop volumineux de ${pseudo} dans ${room}.`);
            return; // ignore la maj
        }
        // on vérifie le type
        if (typeof newContent !== 'string')
        {
            return; // ignore la maj
        }
        // on vérifie que l'utilisateur n'envoie pas trop de mises à jour
        const now = Date.now();
        const lastUpdate = updateTimestamps.get(socket.id) || 0;
        if (now - lastUpdate < UPDATE_INTERVAL) 
        {
            console.warn(`[ATTENTION SPAM] Trop de mises à jour de ${pseudo} dans ${room}.`);
            return; // ignore la maj
        }
        updateTimestamps.set(socket.id, now);

        // update en db cette fois
        db.run(`UPDATE rooms SET content = ? WHERE roomName = ?`, [newContent, room], (err) => {
            if (err) {
                console.error("Erreur lors de la mise à jour du contenu de la room:", err.message);
            }
        });

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
    db.all(`SELECT roomName, content FROM rooms`, [], (err, rows) => {
        if (err) 
        {
            return res.status(500).json({ error: "Erreur lors de la récupération des données des rooms." });
        }

        const activeRooms = Array.from(roomsTokens.keys());

        res.json({
            status: 'OK',
            activeConnections: users.size,
            rooms: rows.map(row => ({
                name: row.roomName,
                users: Array.from(users.values())
                    .filter(u => u.room === row.roomName)
                    .map(u => u.pseudo),
                contentPreview: row.content.substring(0, 50) + (row.content.length > 50 ? '...' : '')
            })),
            eventsPerMinute: eventCount 
        });
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


// partie sécurité
// sanitisation des input pour éviter les injections XSS
// on appelle cette méthode sur les pseudos et saisies utilisateurs 
function sanitizeInput(input) {
    if (!input) return '';
    return input.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
}
