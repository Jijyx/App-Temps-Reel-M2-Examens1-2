### **Question 1 – Les technologies temps réel**

* **Polling long** :
**Le principe** : Amélioration du simple Polling, le client envoie une requête au serveur, le serveur va garder la connexion ouverte jusqu'à avoir une réponse à lui envoyer (ou un délais) puis il va fermer la connexion.
**Le sens de communication** : Le client initie toujours la connexion et les réponses ne viennent que du serveur.
Client -> Serveur (une requête)
Serveur -> Client (la réponse)
**Avantages** :
Moins de latence qu'en Polling vu que le serveur ne renvoie pas rien, il envoie les données quand elles sont disponibles, c'est donc plus économiques en terme de ressources (moins de requêtes inutiles ou vide).
**Inconvénients** :
On continue quand même de renvoyer une requête HTTP à chaque réponse du serveur (donc on surcharge quand même la bande passante pour rien), plus difficile à gérer côté serveur, nombre de connexion limitées en fonction du navigateur ou du serveur.
**Cas d'usage** : 
Utilisé lorsqu'on a des mises à jour pas trop fréquentes et si on ne veut pas se compliquer avec du Websocket.
On peut le retrouver dans des anciennes applications, ou bien lorsque les Websocket ne sont pas supportés.

* **Server-Sent Events (SSE)**
**Le principe** : C'est une connexion HTTP qu'on laisse ouverte indéfiniment pour que le serveur puisse envoyer des événements au fur et à mesure. Le client va écouter les messages avec Javascript EventSource et les traiter en temps réel sans renvoyer de requêtes.
**Le sens de communication** : 
Serveur -> Client
Le client ouvre la connexion mais c'est le serveur qui envoie dessus, c'est unidirectionnel.
**Avantages** :
Simple à mettre en place (ça reste du HTTP + une API native du navigateur), optimisé pour les notifications ou mise à jour en temps réel (car il n'y a que le serveur qui envoie), EventSource gère automatiquement les déconnexions pour assurer une reconnexion automatique et c'est beaucoup moins cher en ressources que le polling vu qu'on ne surcharge pas la bande de requêtes, le serveur va envoyer lorsqu'il a quelque chose à dire.
**Inconvénients** :
Le client ne peut pas envoyer quoi que ce soit au serveur (donc pas adapté dans tous les cas), les anciens navigateurs ne n'ont pas forcément ce système avec EventSource.
**Cas d'usage** :
C'est plutôt utilisé pour des systèmes de notifications en temps réel, de mise à jour de flux en direct (ex: actualité, monitoring, bourses).

* **WebSockets**
**Le principe** : Le WebSocket est un protocole qui permet de faire du bidirectionnelle en temps réel. On a une seule connexion persistante qui ne passe pas par du HTTP mais qui établie son propre canal de communication. L'initialisation de la connexion est faite par une requête HTTP avec un header ```Upgrade: websocket```, si le serveur accepte, il change son protocole en WebSocket et laisse un TCP ouvert pour échanger en simultané les données dans les deux sens.
**Le sens de communication** :
Client <-> Serveur
Le client va initié le protocole en demandant au serveur de passer en WebSockets, puis la communication sera bidirectionnelle et asynchrone, permettant un échange continue.
**Avantages** :
Réduction de latence, communication bidirectionnelle, moins de surcharge réseau avec la suppression de l'en-tête HTTP après le handshake, très utilisé pour les applications en temps réels et bien intégré dans les navigateurs modernes.
**Inconvénients** : 
Pas supporté par les anciens navigateurs, configuration plus compliqué si le bidirectionnel n'est pas nécéssaire, gestion de l'asynchronité.
**Cas d'usage** :
Utilisé pour les jeux multijoueurs en ligne, les chat instantanés, le trading.

---

### **Question 2 – Les fondements de Socket.IO**

* **Namespaces**
Un namespace est un canal de communication distinct indentifié par une URL qui permet d'isoler différentes parties d'une application dans le même serveur Socket.IO.
On se connecte par défaut au namespace ```/```, et on peut faire des namespaces dédiés (```/jeu```, ```/histoire```).
Exemple :
On peut avoir une application de support en ligne, un client peut parler avec le service client.
Mais les agents ont leur propre interface d’administration.
On retrouvera donc deux namespaces :
```/clients``` -> pour les utilisateurs
```/admins``` -> pour le support

* **Rooms**
Les Rooms c'est des sous-groupe dans un namespace, ça permet d'envoyer des messages à un ensemble de personne limité. 
C'est plus comme rejoindre un canal de diffusion précis pour recevoir que les messages qui nous concerne.
Exemple :
On pourrait avoir une application de chat avec pleins de salons :
- Général 
- Musique
- Jeux vidéos
Et choisir de rejoindre Jeux vidéos pour voir que cette conversation.
Comme sur Discord.

* **Broadcast**
Le broadcast ça permet d'envoyer un message à tous les utilisateurs connectés d'un même namespace ou room, sauf celui qui envoie le message.
Exemple :
Sur World of Warcraft, quand je fais bouger mon personnage, le serveur envoie l'information à tous les utilisateurs pour qu'il me voit me déplacer, mais il ne me l'envoie pas à moi car c'est mon interface qui me montre déjà mon mouvement.

---

### **Question 3 – Scalabilité et Redis Pub/Sub**

1. Socket.IO utilise un stateful connection : chaque instance maintient l’état des sockets qui lui sont connectés.
Dans un environnement multi-instance :
Événements ciblés sur un socket précis doivent atteindre la bonne instance.
Emissions globales (broadcasts) doivent être propagées à toutes les instances.

2. Socket.IO-redis est un adaptateur qui utilise Redis Pub/Sub pour propager les événements entre instances.
Fonctionnement :
Chaque instance Socket.IO s’abonne à un canal Redis.
Lorsqu’une instance émet un événement, il est publié sur Redis.
Redis diffuse cet événement aux autres instances, qui le reçoivent et transmettent aux clients concernés.

3. 
Client A → Instance 1
Client B → Instance 2
Client C → Instance 3

Instance 1 reçoit le message de A  
    ↓
Instance 1 envoie le message à Redis (pub)  
    ↓
Redis le redistribue à toutes les instances (sub)  
    ↓
Instance 2 → envoie à B  
Instance 3 → envoie à C


### **Question 4 – Sécurité et Monitoring**

1. Les applications temps réel (chat, collaboration, jeux, IoT) présentent des risques liés à leurs connexions persistantes et bidirectionnelles.
Les principaux risques sont :
- Usurpation d’identité si l’authentification est faible,
- Attaques DDoS qui peuvent saturer le serveur,
- Interception ou altération des données si les échanges ne sont pas chiffrés.

2. Pour limiter ces risques, il faut :
- Mettre en place une authentification et autorisation sécurisées,
- Chiffrer les communications (HTTPS / WSS),
- Limiter le nombre de requêtes et filtrer les messages pour éviter le spam ou les abus.

3. Les indicateurs qu'on peut surveiller : 
- Nombre de connexions actives :Pour voir combien d’utilisateurs sont connectés en même temps et repérer un pic ou un bug éventuel.
- Taux de messages échangés par seconde : Pour vérifier que l’activité reste normale et qu’il n’y a pas trop d’envois (signe d’un spam ou d’une surcharge).
- Latence moyenne des messages :Pour s’assurer que les messages circulent rapidement et qu’il n’y a pas de ralentissement côté serveur ou réseau.

4. Quelques outils/techniques de monitoring : 
- Console et logs : suivre les connexions/déconnexions directement dans la console du serveur.
- Prometheus + Grafana : récupérer et visualiser des métriques temps réel (latence, connexions, charge).
- Métriques internes Socket.IO : via les événements connection, disconnect, packet, etc.
- Outils de logs centralisés : comme Winston, Elastic Stack (ELK) ou Datadog pour suivre les erreurs et le trafic.

---

### **Question 5 – Bonnes pratiques**

1. Architecture scalable : prévoir plusieurs instances et un système comme Redis pour bien gérer la charge.
2. Filtrage des messages : limiter la taille et la fréquence des envois pour éviter les abus (spam, ddos, injections).
3. Gestion des connexions : détecter les déconnexions et reconnecter automatiquement les clients (jwt).
4. Optimisation des échanges : envoyer uniquement les données utiles et les compresser si possible.
5. Monitoring régulier : suivre la latence, les erreurs et les connexions pour anticiper les problèmes.