const PDFDocument = require('pdfkit');
const ydke = require("ydke");
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const favicon = require('serve-favicon');
const pdfFolder = path.join(__dirname, 'pdf');
const uploadFolder = path.join(__dirname, 'upload_ydk');
const imagesFolder = path.join(__dirname, 'images');
const thumbnailsFolder = path.join(__dirname, 'thumbnails');
const cacheFolder = path.join(__dirname, 'cache');

const port = 8080;

const makeId = (prmLength) => {
  let result = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charsLength = chars.length;
  for (let i = 0; i < prmLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * charsLength));
  }
  return result;
};

// Variable globale decklist supprimée - on utilise maintenant les résultats de downloadImages()

// enable files upload
app.use(fileUpload({
  createParentPath: true,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2MB max file(s) size
  },
}));

app.use(favicon(path.join(__dirname, '.', 'favicon.ico')));

app.disable('etag');

app.use(express.static('pdf'));
app.use(express.static('images'));
app.use('/thumbnails', express.static('thumbnails'));

app.set('view engine', 'ejs');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true,
}));
app.use(morgan('dev'));

// Middleware to handle errors consistently
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('pages/success', {
    success: '',
    page: '',
    error: 'Internal Server Error',
    lang: req.acceptsLanguages()[0],
  });
});

const isYdkFile = (filename) => {
  return filename.endsWith('.ydk');
};

const flattenObjectValues = (obj) => {
  return Object.values(obj).reduce((acc, currentValue) => {
    return acc.concat(Array.from(currentValue).map(item => item.toString()));
  }, []);
};
const generateUniqueFilename = (originalFilename) => {
  const prefix = originalFilename.replace(/\.[^/.]+$/, '').substring(0, 12).replace(/\s+/g, '').replace(/[^\w\s]/gi, '');
  return `${prefix}_${makeId(12)}.pdf`;
};

app.post('/upload-decklist', async (req, res) => {
  try {
    if (!req.files && !req.body.ydkeCode && !req.body.cards) {
      throw new Error('No uploaded file, YDKE code, or card list provided.');
    }

    let decklist;
    let filename;
    let downloadResult;

    if (req.files && req.files.deckfile) {
      const deckfile = req.files.deckfile;
      if (!isYdkFile(deckfile.name)) {
        throw new Error('Invalid file type. Only .ydk files are allowed.');
      }

      const fileLocation = path.join(uploadFolder, deckfile.name);
      await deckfile.mv(fileLocation);

      filename = generateUniqueFilename(deckfile.name);
      decklist = getYdkDecklist(fileLocation);
      downloadResult = await downloadImages(decklist);
    } else if (req.body.ydkeCode) {
      const ydkeCode = req.body.ydkeCode;
      const sanitizedCode = !ydkeCode.startsWith("ydke://") ? "ydke://"+ydkeCode : ydkeCode;
      const decodedCode = ydke.parseURL(sanitizedCode);
      decklist = flattenObjectValues(decodedCode);

      filename = generateUniqueFilename('ydke_deck.pdf');
      downloadResult = await downloadImages(decklist);
    } else if (req.body.cards) {
      // Accepter soit un tableau directement, soit une chaîne JSON
      let cardsArray = req.body.cards;
      if (typeof cardsArray === 'string') {
        try {
          cardsArray = JSON.parse(cardsArray);
        } catch (e) {
          throw new Error('Invalid cards format');
        }
      }
      
      if (Array.isArray(cardsArray)) {
        // Nouvelle méthode : liste de cartes avec quantités
        // Format attendu : [{ id: 123456, quantity: 3 }, { id: 789012, quantity: 1 }]
        decklist = [];
        cardsArray.forEach(card => {
          const cardId = String(card.id);
          const quantity = parseInt(card.quantity) || 1;
          // Ajouter la carte autant de fois que la quantité
          for (let i = 0; i < quantity; i++) {
            decklist.push(cardId);
          }
        });

        filename = generateUniqueFilename('builder.pdf');
        downloadResult = await downloadImages(decklist);
      } else {
        throw new Error('Invalid cards format: must be an array');
      }
    }

    // Vérifier s'il y a des erreurs
    const hasErrors = downloadResult.errors && downloadResult.errors.length > 0;
    const validCardIds = downloadResult.successful || [];

    // Vérifier qu'il y a au moins une carte valide
    if (validCardIds.length === 0) {
      const lang = req.acceptsLanguages()[0];
      const isFr = lang.includes('fr');
      const errorMsg = isFr 
        ? 'Aucune carte valide n\'a pu être téléchargée. Vérifiez les IDs de cartes dans votre decklist.'
        : 'No valid card could be downloaded. Check the card IDs in your decklist.';
      throw new Error(errorMsg);
    }

    // Générer le PDF uniquement avec les cartes valides
    const cardsAdded = await makePdfProxies(filename, validCardIds);

    // Préparer les messages pour l'utilisateur
    let warningMessage = '';
    if (hasErrors) {
      const lang = req.acceptsLanguages()[0];
      const isFr = lang.includes('fr');
      
      if (isFr) {
        warningMessage = `Attention : ${downloadResult.errors.length} carte(s) n'ont pas pu être téléchargées : ${downloadResult.errors.map(e => e.id).join(', ')}. Le PDF a été généré avec ${cardsAdded} carte(s) disponible(s).`;
      } else {
        warningMessage = `Warning: ${downloadResult.errors.length} card(s) could not be downloaded: ${downloadResult.errors.map(e => e.id).join(', ')}. PDF generated with ${cardsAdded} available card(s).`;
      }
      
      console.warn('⚠ Cartes manquantes:', downloadResult.errors);
    }

    res.render('pages/success', {
      filename,
      success: 'success',
      page: 'upload',
      error: '',
      warning: warningMessage, // Nouveau paramètre
      missingCards: downloadResult.errors || [], // Liste des cartes manquantes
      lang: req.acceptsLanguages()[0],
    });
  } catch (err) {
    console.error('Erreur lors de la génération:', err);
    res.render('pages/success', {
      success: '',
      page: '',
      error: err.message,
      lang: req.acceptsLanguages()[0],
    });
  }
});

const downloadImage = async (prmIdCard) => {
  const url = `https://images.ygoprodeck.com/images/cards/${prmIdCard}.jpg`;
  const imagePath = path.join(imagesFolder, `${prmIdCard}.jpg`);
  
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      validateStatus: (status) => status === 200, // Rejeter si pas 200
      timeout: 10000, // Timeout de 10 secondes
    });

    const writer = fs.createWriteStream(imagePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', (err) => {
        // Nettoyer le fichier partiel en cas d'erreur
        if (fs.existsSync(imagePath)) {
          fs.unlink(imagePath, () => {});
        }
        reject(err);
      });
    });
  } catch (error) {
    // Nettoyer le fichier partiel si créé
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    // Propager l'erreur avec contexte
    if (error.response) {
      // Erreur HTTP (404, 500, etc.)
      throw new Error(`HTTP ${error.response.status}: Image non disponible pour la carte ${prmIdCard}`);
    } else if (error.request) {
      // Pas de réponse (timeout, réseau)
      throw new Error(`Timeout/Réseau: Impossible de télécharger l'image pour la carte ${prmIdCard}`);
    } else {
      // Autre erreur
      throw new Error(`Erreur lors du téléchargement de la carte ${prmIdCard}: ${error.message}`);
    }
  }
};

const onlyCardsId = (prmString) => {
  return !(prmString.includes('#') || prmString.includes('!') || prmString.length < 4);
};

const removeFirstZero = (e) => {
  return e.charAt(0) !== '0' ? e : removeFirstZero(e.slice(1));
};

const getYdkDecklist = (deckfilePath) => {
  return fs.readFileSync(deckfilePath).toString().split('\n').filter((elm) => onlyCardsId(elm)).map((elm) => elm.trim());
};
const downloadImages = async (decklist) => {
  console.log('New images downloading...');
  const errors = []; // Liste des IDs de cartes qui ont échoué
  const successful = []; // Liste des IDs de cartes téléchargées avec succès
  const originalDecklist = [...decklist]; // Sauvegarder les IDs originaux

  for (let i = 0; i < decklist.length; i++) {
    const originalId = decklist[i];
    decklist[i] = removeFirstZero(decklist[i]);
    const cardId = decklist[i];

    const imagePath = path.join(imagesFolder, `${cardId}.jpg`);
    
    if (!fs.existsSync(imagePath)) {
      try {
        await downloadImage(cardId);
        successful.push(cardId);
        console.log(`✓ Image téléchargée pour la carte ${cardId}`);
      } catch (error) {
        errors.push({
          id: cardId,
          originalId: originalId,
          error: error.message
        });
        console.error(`✗ Erreur pour la carte ${cardId}: ${error.message}`);
        // Continuer avec les autres cartes
      }
    } else {
      successful.push(cardId);
      console.log(`✓ Image déjà en cache pour la carte ${cardId}`);
    }
  }

  // Retourner les résultats pour traitement ultérieur
  return {
    successful: successful,
    errors: errors,
    total: decklist.length
  };
};

const makePdfProxies = async (prmFileName, validCardIds) => {
  // Utiliser uniquement les IDs de cartes valides
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    permissions: {
      printing: 'highResolution',
    },
    info: {
      Title: 'Proxy file',
      Author: 'YGOProxy.com',
    },
  });

  doc.pipe(fs.createWriteStream(path.join(pdfFolder, prmFileName)));

  let x = 40;
  let y = 40;
  const width = 167;
  const height = 244;
  const margin = 0;
  let cardsAdded = 0;

  console.log('PDF file creation...');
  
  for (let i = 0; i < validCardIds.length; i++) {
    const imagePath = path.join(imagesFolder, `${validCardIds[i]}.jpg`);

    // Vérifier que l'image existe avant de l'ajouter
    if (!fs.existsSync(imagePath)) {
      console.warn(`⚠ Image manquante pour la carte ${validCardIds[i]}, ignorée dans le PDF`);
      continue; // Ignorer cette carte
    }

    if (cardsAdded % 3 !== 0) {
      x = x + width + margin;
    } else if (cardsAdded !== 0) {
      x = 40;
      y = y + height + margin;
    }

    if (y + height > 842) {
      y = 40;
      x = 40;
      doc.addPage().image(imagePath, x, y, { fit: [width, height] });
    } else {
      doc.image(imagePath, x, y, { fit: [width, height] });
    }
    
    cardsAdded++;
  }

  doc.end();
  
  return cardsAdded; // Retourner le nombre de cartes ajoutées
};

app.get('/', (req, res) => {
  res.render('pages/index', {
    page: 'home',
    lang: req.acceptsLanguages()[0]
  });
})

app.get('/calculator', (req, res) => {
  res.render('pages/calculator', {
    page: 'calculator',
    lang: req.acceptsLanguages()[0]
  });
})

app.get('/credits', (req, res) => {
  res.render('pages/credits', {
    page: 'credits',
    lang: req.acceptsLanguages()[0]
  });
})

// Endpoint pour vérifier si un PDF existe encore sur le serveur
app.get('/api/check-pdf/:filename', (req, res) => {
  const filename = req.params.filename;
  // Sécuriser le nom de fichier pour éviter les path traversal
  const safeFilename = path.basename(filename);
  const filePath = path.join(pdfFolder, safeFilename);
  
  if (fs.existsSync(filePath)) {
    res.json({ exists: true });
  } else {
    res.json({ exists: false });
  }
});

// Endpoint pour vérifier plusieurs PDFs en une seule requête
app.post('/api/check-pdfs', (req, res) => {
  const filenames = req.body.filenames || [];
  const results = {};
  
  filenames.forEach(filename => {
    const safeFilename = path.basename(filename);
    const filePath = path.join(pdfFolder, safeFilename);
    results[filename] = fs.existsSync(filePath);
  });
  
  res.json({ results });
});

// Fonction pour créer un hash simple d'une chaîne
const createHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
};

// Fonction pour obtenir le chemin du cache
const getCachePath = (searchTerm, language) => {
  const cacheKey = `${searchTerm.toLowerCase().trim()}_${language}`;
  const hash = createHash(cacheKey);
  return path.join(cacheFolder, `${hash}.json`);
};

// Fonction pour lire le cache
const readCache = (cachePath) => {
  try {
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf8');
      const cached = JSON.parse(data);
      // Vérifier que le cache n'est pas trop vieux (7 jours)
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 jours
      if (cacheAge < maxAge) {
        return cached.data;
      }
      // Cache expiré, supprimer le fichier
      fs.unlinkSync(cachePath);
    }
  } catch (error) {
    console.error('Erreur lors de la lecture du cache:', error);
  }
  return null;
};

// Fonction pour écrire dans le cache
const writeCache = (cachePath, data) => {
  try {
    if (!fs.existsSync(cacheFolder)) {
      fs.mkdirSync(cacheFolder, { recursive: true });
    }
    
    const cacheData = {
      timestamp: Date.now(),
      data: data
    };
    
    fs.writeFileSync(cachePath, JSON.stringify(cacheData), 'utf8');
    
    // Nettoyer le cache si trop de fichiers (garder les 1000 plus récents)
    cleanupCache();
  } catch (error) {
    console.error('Erreur lors de l\'écriture du cache:', error);
  }
};

// Fonction pour nettoyer le cache (garder les 1000 plus récents)
const cleanupCache = () => {
  try {
    if (!fs.existsSync(cacheFolder)) return;
    
    const files = fs.readdirSync(cacheFolder)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(cacheFolder, f);
        const stats = fs.statSync(filePath);
        return { name: f, path: filePath, mtime: stats.mtime.getTime() };
      })
      .sort((a, b) => b.mtime - a.mtime); // Plus récent en premier
    
    // Supprimer les fichiers au-delà de 1000
    if (files.length > 1000) {
      files.slice(1000).forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          console.error('Erreur lors de la suppression du cache:', error);
        }
      });
    }
  } catch (error) {
    console.error('Erreur lors du nettoyage du cache:', error);
  }
};

// Endpoint pour rechercher des cartes par nom
app.get('/api/search-cards', async (req, res) => {
  try {
    const searchTerm = req.query.name || req.query.fname || '';
    const language = req.query.language || 'en'; // Par défaut en anglais
    
    if (!searchTerm || searchTerm.length < 2) {
      return res.json({ data: [] });
    }

    // Vérifier le cache d'abord
    const cachePath = getCachePath(searchTerm, language);
    const cachedData = readCache(cachePath);
    if (cachedData) {
      return res.json({ data: cachedData });
    }

    // Utiliser fname pour une recherche partielle (fuzzy search)
    // L'API YGOPRODeck supporte le paramètre language (en, fr, de, es, it, pt, ja, ko, zh)
    // Note: l'anglais est la langue par défaut, donc on n'ajoute le paramètre que pour les autres langues
    let apiUrl = `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(searchTerm)}`;
    
    // Ajouter le paramètre de langue si ce n'est pas l'anglais (langue par défaut de l'API)
    if (language && language !== 'en') {
      apiUrl += `&language=${encodeURIComponent(language)}`;
    }
    
    let response;
    try {
      response = await axios({
        url: apiUrl,
        method: 'GET',
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      });
    } catch (axiosError) {
      console.error('Erreur axios:', axiosError.message);
      if (axiosError.response) {
        console.error('Status:', axiosError.response.status);
        console.error('Data:', JSON.stringify(axiosError.response.data).substring(0, 500));
      }
      if (axiosError.code) {
        console.error('Code erreur:', axiosError.code);
      }
      throw axiosError;
    }
    
    // Vérifier que la réponse est valide
    if (!response || !response.data) {
      console.error('Réponse API invalide ou vide');
      throw new Error('Réponse API vide');
    }
    
    // L'API peut retourner un objet avec data: [] si aucun résultat
    // Mais parfois data peut être null ou undefined
    if (response.data.data === null || response.data.data === undefined) {
      response.data.data = [];
    } else if (!Array.isArray(response.data.data)) {
      console.error('Format de réponse inattendu:', typeof response.data.data);
      // Si ce n'est pas un tableau, retourner un tableau vide
      response.data.data = [];
    }

    // Limiter à 15 résultats maximum
    let cards = [];
    try {
      const rawCards = response.data.data || [];
      cards = rawCards.slice(0, 15).map(card => {
        try {
          // S'assurer que toutes les propriétés existent
          if (!card || !card.id) {
            console.warn('Carte invalide dans les résultats:', JSON.stringify(card).substring(0, 100));
            return null;
          }
          return {
            id: String(card.id), // S'assurer que c'est une string
            name: String(card.name || ''),
            type: String(card.type || ''),
            desc: String(card.desc || ''),
            race: String(card.race || ''),
            archetype: card.archetype ? String(card.archetype) : null,
            imageUrl: card.card_images && card.card_images[0]
              ? `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`
              : null,
            thumbnailUrl: card.card_images && card.card_images[0]
              ? `https://images.ygoprodeck.com/images/cards_small/${card.id}.jpg`
              : null,
          };
        } catch (cardError) {
          console.error('Erreur lors du traitement d\'une carte:', cardError.message, JSON.stringify(card).substring(0, 100));
          return null;
        }
      }).filter(card => card !== null); // Filtrer les cartes invalides
    } catch (mapError) {
      console.error('Erreur lors du mapping des cartes:', mapError.message);
      console.error('Stack:', mapError.stack);
      cards = [];
    }

    // Mettre en cache les résultats
    try {
      writeCache(cachePath, cards);
    } catch (cacheError) {
      console.warn('Erreur lors de l\'écriture du cache:', cacheError.message);
      // Continuer même si le cache échoue
    }

    res.json({ data: cards });
  } catch (error) {
    console.error('Erreur lors de la recherche de cartes:', error.message || error);
    console.error('Stack:', error.stack);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data).substring(0, 500));
    }
    if (error.request) {
      console.error('Pas de réponse de l\'API');
    }
    
    // En cas d'erreur, essayer de retourner le cache même s'il est expiré
    try {
      const searchTerm = req.query.name || req.query.fname || '';
      const language = req.query.language || 'en';
      const cachePath = getCachePath(searchTerm, language);
      if (fs.existsSync(cachePath)) {
        const data = fs.readFileSync(cachePath, 'utf8');
        const cached = JSON.parse(data);
        return res.json({ data: cached.data });
      }
    } catch (cacheError) {
      console.error('Erreur lors de la lecture du cache:', cacheError.message);
    }
    
    res.status(500).json({ error: 'Erreur lors de la recherche de cartes' });
  }
});

// Fonction pour télécharger une miniature
const downloadThumbnail = async (cardId) => {
  const url = `https://images.ygoprodeck.com/images/cards_small/${cardId}.jpg`;
  const thumbnailPath = path.join(thumbnailsFolder, `${cardId}.jpg`);
  
  // Créer le dossier s'il n'existe pas
  if (!fs.existsSync(thumbnailsFolder)) {
    fs.mkdirSync(thumbnailsFolder, { recursive: true });
  }
  
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      validateStatus: (status) => status === 200,
      timeout: 10000,
    });

    const writer = fs.createWriteStream(thumbnailPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', (err) => {
        if (fs.existsSync(thumbnailPath)) {
          fs.unlink(thumbnailPath, () => {});
        }
        reject(err);
      });
    });
  } catch (error) {
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
    }
    throw error;
  }
};

// Endpoint pour servir les miniatures (avec cache)
app.get('/api/card-thumbnail/:id', async (req, res) => {
  try {
    const cardId = req.params.id;
    const thumbnailPath = path.join(thumbnailsFolder, `${cardId}.jpg`);
    
    // Si la miniature existe déjà, la servir
    if (fs.existsSync(thumbnailPath)) {
      return res.sendFile(path.resolve(thumbnailPath));
    }
    
    // Sinon, la télécharger puis la servir
    try {
      await downloadThumbnail(cardId);
      res.sendFile(path.resolve(thumbnailPath));
    } catch (error) {
      // Si le téléchargement échoue, retourner une erreur 404
      res.status(404).json({ error: 'Miniature non disponible' });
    }
  } catch (error) {
    console.error('Erreur lors de la récupération de la miniature:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.use(function (req, res, next) {
  res.status(404);
  res.render('pages/404', {
    page: '',
    lang: req.acceptsLanguages()[0]
  });
});


app.listen(port, () => {
  console.log(`YGOProxy is running, please visit http://localhost:${port} to make your proxies!`)
})