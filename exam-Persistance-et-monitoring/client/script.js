const loginForm = document.getElementById('login-form');
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const editor = document.getElementById('collaborative-editor');
const errorMessage = document.getElementById('error-message');
const userListElement = document.getElementById('user-list');
const notificationsElement = document.getElementById('notifications');
const latencyDisplay = document.getElementById('latency-display');

let socket; 
const logoutButton = document.getElementById('logout-button');

function waitBetweenMsg(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

function attemptAutoReconnect() {
    const pseudo = localStorage.getItem('collabboard_pseudo');
    const room = localStorage.getItem('collabboard_room');
    const roomToken = localStorage.getItem('collabboard_token');

    if (!pseudo || !room || !roomToken) {
        console.log("Aucune session sauvegardée trouvée.");
        editor.disabled = true;
        return; 
    }

    console.log(`Tentative de reconnexion automatique à la room: ${room} avec le pseudo: ${pseudo}`);
    
    socket = io({
        query: {
            pseudo,
            room,
            token: roomToken
        },
        reconnection: true, 
    });

    document.getElementById('current-pseudo').textContent = pseudo;
    document.getElementById('current-room').textContent = room;
    
    socket.on('connect', () => {
        console.log(`Reconnexion automatique réussie à la room ${room}`);
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        editor.disabled = false;
        setupSocketListeners(socket);
        errorMessage.textContent = "";
    });

    socket.on('connect_error', (err) => {
        console.error("Échec de la reconnexion automatique:", err.message);
        errorMessage.textContent = `Session expirée ou invalide. Veuillez vous reconnecter.`;
        localStorage.clear();
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
        if (socket) {
            socket.close();
        };
    });
}

attemptAutoReconnect();



// le form de connexion
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pseudo = document.getElementById('pseudo').value.trim();
    const room = document.getElementById('room').value.trim();

    if (!pseudo || !room ) {
        errorMessage.textContent = "Veuillez remplir tous les champs.";
        return;
    }
    errorMessage.textContent = "Connexion en cours...";
    
    const handleLoginError = (msg) => {
        console.error("Erreur de connexion:", msg);
        errorMessage.textContent = `Erreur : ${msg}. Réessayez.`; 
        if (socket) {
            socket.close();
            socket = null;
        };
    };

    try {
        console.log(`Tentative de connexion à la room: ${room} avec le pseudo: ${pseudo}`);
        // requête au serveur pour rejoindre/créer la room (pour avoir le token)
        const response = await fetch('/api/join', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ roomName: room })
        });

        if (!response.ok) {
            throw new Error('Erreur lors de la vérification de la room.');
        }

        const data = await response.json();
        // on recup le token
        const { token: roomToken } = data;
        // on initialise la connexion Socket.IO avec le token
        socket = io({
            query: {
                pseudo,
                room,
                token: roomToken
            }
        });

        // on attend la connexion réussie
        socket.on('connect', () => {
            console.log(`Connecté à la room ${room}`);
            loginContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            document.getElementById('current-pseudo').textContent = pseudo;
            document.getElementById('current-room').textContent = room;
            editor.disabled = false;
            errorMessage.textContent = "";

            // on stock les info de la session
            localStorage.setItem('collabboard-pseudo', pseudo);
            localStorage.setItem('collabboard-room', room);
            localStorage.setItem('collabboard-token', roomToken);
            
            // on met les listeners pour les events Socket.IO
            setupSocketListeners(socket);
        });

        // si on a une erreur de connexion 
        socket.on('connect_error', (err) => {
            handleLoginError(err.message);
        });

    // remonte les erreurs
    } catch (err) {
        handleLoginError(err.message);
    }
});


function setupSocketListeners(socket) {

    const emitUpdate = () => {
        if (editor.isUpdating) {
            return;
        };
        socket.emit('update', editor.value);
    };

    // on debounce les envois pour éviter d'inonder le serveur
    // a chaque input (frappe clavier)
    const debounceEmitUpdate = waitBetweenMsg(emitUpdate, 200);
    
    // listeners pour les events 
    editor.addEventListener('input', debounceEmitUpdate);

    // recup du contenu mis à jour
    socket.on('update', (newContent) => {
        // si pas de changement, on fait rien
        if (editor.value === newContent) {
            return;
        };
        // sinon on met à jour le contenu et on permet à nouveau les inputs
        editor.isUpdating = true; 
        editor.value = newContent;
        editor.isUpdating = false;
    });

    // notifications (join, leave, initial)
    socket.on('notification', ({ type, message, userList }) => {
        console.log(`[NOTIF] ${message}`);
        const notifItem = document.createElement('p');
        notifItem.textContent = message;
        //on met en haut
        notificationsElement.prepend(notifItem); 
        // update de la liste des users
        userListElement.innerHTML = ''; // clear
        userList.forEach(pseudo => {
            const listItem = document.createElement('li');
            listItem.textContent = pseudo;
            userListElement.appendChild(listItem);
        });
    });
    // gestion de la latence
    socket.on('pong', (ms) => {
        latencyDisplay.textContent = `${ms} ms`;
    });
}


logoutButton.addEventListener('click', () => {
    localStorage.clear(); 
    if (socket) {
        socket.close();
    }
    appContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
    document.getElementById('pseudo').value = '';
    document.getElementById('room').value = '';
    errorMessage.textContent = "Déconnecté. Revenez vite !";
});