### Question 1 – Services cloud temps réel
a) Deux services managés sont Firebase Realtime Database et AWS AppSync.

b) Comparaison : Firebase Realtime Database utilise un modèle JSON unique et a une bonne persistance native, mais sa scalabilité peut être limitée par la contention sur l'arbre de données. AppSync utilise GraphQL pour un schéma structuré et persiste dans des BDD AWS (comme DynamoDB). Son mode d'écoute par abonnement est plus précis que celui de Firebase Realtime Database, et sa scalabilité est meilleure car elle est découplée.

c) Cas d'usage : J'utiliserais Firebase Realtime Database pour un prototype rapide ou une application de chat simple. J'utiliserais AWS AppSync pour une application complexe nécessitant une gestion fine des permissions et l'accès à différentes bases de données.

---

### Question 2 – Sécurité temps réel
a) Risques et protections :

DDoS via connexions persistantes : Protéger en utilisant le Throttle (limitation de fréquence) sur les connexions et les événements.

Injection de scripts (XSS) : Protéger en utilisant la sanitisation de toutes les données reçues (pseudo, contenu).

Usurpation d'identité/Accès non autorisé : Protéger en validant les tokens d'authentification (JWT) à chaque tentative de connexion/reconnexion.

b) La gestion des identités est cruciale car elle est la seule façon de déterminer si un utilisateur a l'autorisation d'accéder à un canal privé ou d'envoyer une commande spécifique. C'est la base de la sécurité en temps réel.

---

### Question 3 – WebSockets vs Webhooks
a) Un WebSocket est une connexion TCP persistante et bidirectionnelle. Un Webhook est un simple appel HTTP POST effectué par le serveur vers l'URL du client en cas d'événement.

b) Avantages et limites :

WebSockets : Avantages : Faible latence et bidirectionnel. Limites : Coût de maintien des connexions et complexité du load balancing (nécessite des sessions sticky).

Webhooks : Avantages : Simplicité d'implémentation et faible coût pour l'émetteur. Limites : Unidirectionnel et la fiabilité dépend de la disponibilité du client récepteur.

c) Un Webhook est préférable pour une notification asynchrone pour un événement rare et unique, comme confirmer une transaction de paiement. Utiliser un WebSocket pour un événement unique serait un gaspillage de ressources.

---

### Question 4 – CRDT & Collaboration
a) Un CRDT (Conflict-free Replicated Data Type) est un type de données répliqué qui garantit que tous les clients convergeront vers le même état final après toutes les modifications, peu importe l'ordre ou la latence d'application des opérations.

b) Un exemple concret est un éditeur de texte collaboratif où plusieurs personnes tapent en même temps dans le même document.

c) Un CRDT évite les conflits car ses opérations sont conçues pour être commutatives et associatives, ou utilise des fonctions de fusion (comme Max ou Union) qui sont idempotentes. Cela signifie que l'ordre dans lequel les opérations arrivent n'a pas d'importance.

---

### Question 5 – Monitoring temps réel
a) Trois métriques clés sont la Latence P95/P99 (Ping/Pong), le nombre de Connexions actives, et le Taux d'erreurs (Socket/HTTP).

b) Prometheus collecte les métriques (latence, erreurs) et les stocke. Grafana les visualise sous forme de graphiques en temps réel, ce qui permet de surveiller la santé et de détecter les pics de charge ou de latence.

c) La différence est que les Logs sont des événements discrets pour le débogage (ex: "utilisateur déconnecté"). Les Traces suivent le parcours complet d'une requête entre les services. Les Métriques sont des valeurs numériques agrégées (ex: "50 connexions/seconde") pour la surveillance globale.

---

### Question 6 – Déploiement & Connexions persistantes
a) Les connexions WebSockets impactent :

Load Balancing : Elles nécessitent des sessions "sticky" (collantes) pour toujours renvoyer l'utilisateur au même serveur.

Scalabilité : Elles consomment de la mémoire sur les serveurs pour maintenir le socket ouvert, ce qui limite la densité de connexions par machine.

b) Kubernetes est utilisé car il gère le routage avec les règles de sticky session et permet l'auto-scaling (ajouter/retirer des serveurs) basé sur la charge des connexions, assurant la haute disponibilité.

---

### Question 7 – Stratégies de résilience client
a) Trois mécanismes côté client pour gérer les déconnexions sont :

Reconnexion automatique : Le client essaie immédiatement de rétablir la connexion.

Gestion de l'état (Cache local) : Stocker l'état le plus récent du système pour une reprise rapide après reconnexion.

Détection des pannes (Heartbeat/Ping-Pong) : Échange de petits messages réguliers pour vérifier que la connexion est saine.

b) L'exponential backoff est une stratégie où le client augmente l'intervalle de temps entre les tentatives de reconnexion de manière exponentielle après chaque échec (ex: 1s, 2s, 4s, 8s, etc.). Cela réduit la surcharge sur le serveur qui est en train de redémarrer.