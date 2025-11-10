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
    if (!req.files && !req.body.ydkeCode) {
      throw new Error('No uploaded file or YDKE code provided.');
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
    }

    // Vérifier s'il y a des erreurs
    const hasErrors = downloadResult.errors && downloadResult.errors.length > 0;
    const validCardIds = downloadResult.successful || [];

    // Vérifier qu'il y a au moins une carte valide
    if (validCardIds.length === 0) {
      throw new Error('Aucune carte valide n\'a pu être téléchargée. Vérifiez les IDs de cartes dans votre decklist.');
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