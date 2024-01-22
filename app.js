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

let decklist;

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

    if (req.files && req.files.deckfile) {
      const deckfile = req.files.deckfile;
      if (!isYdkFile(deckfile.name)) {
        throw new Error('Invalid file type. Only .ydk files are allowed.');
      }

      const fileLocation = path.join(uploadFolder, deckfile.name);
      await deckfile.mv(fileLocation);

      const filename = generateUniqueFilename(deckfile.name);
      decklist = getYdkDecklist(fileLocation);
      await downloadImages(decklist);
      makePdfProxies(filename);

      res.render('pages/success', {
        filename,
        success: 'success',
        page: 'upload',
        error: '',
        lang: req.acceptsLanguages()[0],
      });
    } else if (req.body.ydkeCode) {
      const ydkeCode = req.body.ydkeCode;
      const sanitizedCode = !ydkeCode.startsWith("ydke://") ? "ydke://"+ydkeCode : ydkeCode;
      const decodedCode = ydke.parseURL(sanitizedCode);
      decklist = flattenObjectValues(decodedCode);

      const filename = generateUniqueFilename('ydke_deck.pdf');
      await downloadImages(decklist);
      makePdfProxies(filename);

      res.render('pages/success', {
        filename,
        success: 'success',
        page: 'upload',
        error: '',
        lang: req.acceptsLanguages()[0],
      });
    }
  } catch (err) {
    console.error(err);
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
  const writer = fs.createWriteStream(imagePath);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
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

  for (let i = 0; i < decklist.length; i++) {
    decklist[i] = removeFirstZero(decklist[i]);

    const imagePath = path.join(imagesFolder, `${decklist[i]}.jpg`);
    if (!fs.existsSync(imagePath)) {
      await downloadImage(decklist[i]);
    }
  }
};

const makePdfProxies = async (prmFileName) => {
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

  console.log('PDF file creation...');
  for (let i = 0; i < decklist.length; i++) {
    const imagePath = path.join(imagesFolder, `${decklist[i]}.jpg`);

    if (i % 3 !== 0) {
      x = x + width + margin;
    } else if (i !== 0) {
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
  }

  doc.end();
};

app.get('/', (req, res) => {
  res.render('pages/index', {
    page: 'home',
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