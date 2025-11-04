# YGOProxy - Générateur de Proxies Yu-Gi-Oh!

> **Disclaimer**: Yu-Gi-Oh! est une marque déposée de Konami Digital Entertainment. Ce projet est un outil non officiel créé à des fins éducatives et personnelles. Les cartes et images utilisées sont la propriété de Konami. Ce projet n'est pas affilié, approuvé ou sponsorisé par Konami.

## 📋 Description

YGOProxy est une application web simple et intuitive qui permet de générer des fichiers PDF de proxies de cartes Yu-Gi-Oh! prêts à imprimer. L'application accepte deux formats d'entrée :

- **Fichier YDK** : Format standard de liste de deck utilisé par les simulateurs Yu-Gi-Oh!
- **Code YDKE** : Format de partage de deck via URL

L'application télécharge automatiquement les images des cartes depuis l'API YGOPRODeck, les organise en grille sur des pages A4, et génère un PDF optimisé pour l'impression.

## ✨ Fonctionnalités

- 🎴 Génération de PDF de proxies à partir de fichiers YDK
- 🔗 Support des codes YDKE pour partage rapide
- 📥 Téléchargement automatique des images depuis YGOPRODeck
- 📄 Organisation automatique des cartes en grille (3 par ligne)
- 🌐 Interface multilingue (Français/Anglais)
- 🖨️ Format optimisé pour l'impression A4
- 💾 Cache des images pour éviter les téléchargements répétés

## 🚀 Installation

### Prérequis

- Node.js (version 14 ou supérieure)
- npm (Node Package Manager)

### Installation

1. Clonez le repository et basculez sur la branche `webapp` :
```bash
git clone git@github.com:ZeBoBobby/YGOProxiesGenerator.git
cd YGOProxiesGenerator
git checkout webapp
```

2. Installez les dépendances :
```bash
npm install
```

3. Lancez l'application :
```bash
npm start
```

4. Accédez à l'application dans votre navigateur :
```
http://localhost:8080
```

### Déploiement

L'application peut être déployée sur n'importe quel hébergeur Node.js ou conteneurisé avec Docker. Configurez votre environnement selon vos besoins (reverse proxy, SSL, etc.).

## 📖 Utilisation

### Via fichier YDK

1. Préparez votre fichier YDK (format standard de liste de deck)
2. Sur la page d'accueil, cliquez sur "Choisir un fichier" ou "Choose a file"
3. Sélectionnez votre fichier `.ydk`
4. Cliquez sur "Proxyfier !" ou "Proxify!"
5. Attendez le traitement (téléchargement des images si nécessaire)
6. Téléchargez le PDF généré

### Via code YDKE

1. Récupérez votre code YDKE (format de partage de deck)
2. Collez le code dans le champ "YDKE Code"
3. Cliquez sur "Proxyfier !" ou "Proxify!"
4. Téléchargez le PDF généré

### Format du PDF

- Les cartes sont organisées en grille de 3 cartes par ligne
- Format A4 optimisé pour l'impression
- Pas besoin d'ajuster les marges lors de l'impression
- Les images sont mises en cache pour améliorer les performances

## 🛠️ Technologies utilisées

- **Node.js** - Runtime JavaScript
- **Express** - Framework web
- **PDFKit** - Génération de PDF
- **EJS** - Moteur de template
- **Axios** - Client HTTP pour télécharger les images
- **YDKE** - Parser pour les codes de deck

## 📦 Dépendances principales

- `express` - Framework web
- `pdfkit` - Génération de PDF
- `ejs` - Templates
- `axios` - Requêtes HTTP
- `ydke` - Parser YDKE
- `express-fileupload` - Gestion des uploads

## 🌐 API utilisée

L'application utilise l'API publique de [YGOPRODeck](https://db.ygoprodeck.com/api-guide/) pour récupérer les images des cartes :
- Images : `https://images.ygoprodeck.com/images/cards/{CARD_ID}.jpg`

## 📝 Structure du projet

```
ygoproxy/
├── app.js              # Point d'entrée principal
├── package.json        # Dépendances et scripts
├── views/              # Templates EJS
│   ├── pages/          # Pages principales
│   └── partials/        # Partiels réutilisables
├── images/             # Cache des images téléchargées
├── pdf/                # PDF générés
└── upload_ydk/          # Fichiers YDK temporaires
```

## 🚧 Développement

### Scripts disponibles

- `npm start` - Lance l'application en mode production
- `npm test` - (non implémenté)

### Variables d'environnement

- `NODE_ENV` - Environnement (production/development)
- `PORT` - Port d'écoute (par défaut: 8080)

## 📄 Licence

ISC

## 👤 Auteur

**Mazoyer Alexis**

## 🙏 Remerciements

- [YGOPRODeck](https://ygoprodeck.com/) pour l'API et les images
- La communauté Yu-Gi-Oh! pour les outils et formats partagés

## 🌍 Disponibilité

L'application est également disponible en ligne à : [ygoproxy.com](https://ygoproxy.com)

---

**Note** : Cet outil est gratuit et open-source. Si vous souhaitez soutenir le projet, vous pouvez offrir un café à l'auteur via le lien sur la page des crédits !
