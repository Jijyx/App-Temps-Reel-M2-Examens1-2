const loginForm = document.getElementById('login-form');
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const editor = document.getElementById('collaborative-editor');
const errorMessage = document.getElementById('error-message');
const userListElement = document.getElementById('user-list');
const notificationsElement = document.getElementById('notifications');

let socket; // L'instance Socket.IO

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
    
    try {
        console.log(`Tentative de connexion à la room: ${room} avec le pseudo: ${pseudo}`);
        // requête au serveur pour rejoindre/créer la room (pour avoir le token)
        const response = await fetch('/api/join', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
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
        // on met les listeners pour les events Socket.IO
        setupSocketListeners(socket);
    });

    // si on a une erreur de connexion 
    socket.on('connect_error', (err) => {
        console.error("Erreur de connexion:", err.message);
        errorMessage.textContent = `Erreur de connexion : ${err.message}. Réessayez.`;
        if (socket) {
            socket.close();
        };
    });

    // remonte les erreurs
    } catch (err) {
        console.error("Erreur générale (HTTP ou réseau):", err);
        errorMessage.textContent = `Échec de l'opération : ${err.message}`;
    }
});


// Gestion des events Socket.IO 
function setupSocketListeners(socket) {
    
    // listeners pour les events 
    editor.addEventListener('input', () => {
        // si on est en train de mettre à jour le contenu (venant d'un autre user)
        // on block l'event input pour éviter les boucles infinies
        if (editor.isUpdating) {
            return;
        };
        socket.emit('update', editor.value);
    });

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
}