const PDFDocument = require('pdfkit');
const express = require('express');
const app = express();
const fs = require('fs');
const Path = require('path');
const Axios = require('axios');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const favicon = require('serve-favicon');
const pdfFolder = `${__dirname}/pdf`;

const port = 8080;

const makeId = prmLength => {
  let result = '';
  let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let charsLength = chars.length;
  for (let i = 0; i < prmLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * charsLength))
  }
  return result;
}

let decklist;

// enable files upload
app.use(fileUpload({
  createParentPath: true,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 //2MB max file(s) size
  }
}));

app.use(favicon(Path.join(__dirname, '.', 'favicon.ico')))

app.disable('etag');

app.use(express.static('pdf'));

app.set('view engine', 'ejs');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(morgan('dev'));

app.post('/upload-decklist', async (req, res) => {
  try {
    if (!req.files) {
      res.render('pages/success', {
        success: '',
        page: '',
        error: 'Uploaded file is empty or corrupted',
        lang: req.acceptsLanguages()[0]
      });
    } else {
      //Use the name of the input field (i.e. "deckfile") to retrieve the uploaded file
      let deckfile = req.files.deckfile;

      //Use the mv() method to place the file in upload directory (i.e. "uploads")
      let fileLocation = './upload_ydk/' + deckfile.name;
      deckfile.mv(fileLocation).then(a => {
        downloadImages(fileLocation).then(e => {
          const filename = deckfile.name.replace(/\.[^/.]+$/, "").substring(0.12).replace(/\s+/g, '').replace(/[^\w\s]/gi, '') + makeId(12) + '.pdf';
          makePdfProxies(filename);
          console.log("All done!");
          res.render('pages/success', {
            filename: filename,
            success: 'success',
            page: 'upload',
            error: '',
            lang: req.acceptsLanguages()[0]
          });
        }).catch(error => {
          console.error(error)
          res.render('pages/success', {
            success: '',
            page: '',
            error: error,
            lang: req.acceptsLanguages()[0]
          });
        });
      })
    }
  } catch (err) {
    res.status(500).render('pages/success', {
      success: '',
      page: '',
      error: err,
      lang: req.acceptsLanguages()[0]
    });
  }
});

//Permet de récupérer des images de cartes
const downloadImage = async prmIdCard => {
  const url = 'https://storage.googleapis.com/ygoprodeck.com/pics/' + prmIdCard + '.jpg';
  const path = Path.resolve(__dirname, 'images', prmIdCard + '.jpg');
  const writer = fs.createWriteStream(path);

  const response = await Axios({
    url,
    method: 'GET',
    responseType: 'stream'
  })

  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

const onlyCardsId = prmString => {
  if ((prmString.includes('#') || prmString.includes('!')) || prmString.length < 4 ) {
    return false;
  }
  return true;
}

const removeFirstZero = e => {
  if (e.charAt(0) !== "0") {
    return e;
  } else {
    return removeFirstZero(e.slice(1));
  }
}

const downloadImages = async (prmDeckfile) => {
  console.log("New images downloading...");
  console.log('from : ', prmDeckfile); // var decklist;

  decklist = fs.readFileSync(prmDeckfile).toString().split("\n").filter(elm => onlyCardsId(elm)).map(elm => elm.trim());

  for (let i = 0; i < decklist.length; i++) {
    decklist[i] = removeFirstZero(decklist[i]);

    const path = './images/' + decklist[i] + '.jpg';
    if (!fs.existsSync(path)) {
      await downloadImage(decklist[i]);
    }
  }

}

const makePdfProxies = async prmFileName => {

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    permissions: {
      printing: 'highResolution'
    },
    info: {
      Title: 'Proxy file',
      Author: 'YGOProxy.com'
    }
  });
  //Pipe its output somewhere, like to a file or HTTP response 
  //See below for browser usage 
  doc.pipe(fs.createWriteStream(pdfFolder + '/' + prmFileName))

  let x = 40;
  let y = 40;
  let width = 167;
  let height = 244;
  // let width = 173;
  // let height = 252;
  let margin = 0;

  console.log("PDF file creation...");
  for (let i = 0; i < decklist.length; i++) {

    const path = './images/' + decklist[i] + '.jpg';

    if (i % 3 !== 0) {
      x = x + width + margin;
      //y = y + height;   
    } else if (i !== 0) {
      x = 40;
      y = y + height + margin;
    }
    if (y + height > 842) {
      y = 40;
      x = 40;
      doc.addPage().image(path, x, y, {
        fit: [width, height],
        //    align: 'center',
        //    valign: 'center'
      });
    } else {
      doc.image(path, x, y, {
        fit: [width, height],
        //    align: 'center',
        //    valign: 'center'
      });
    }
  }
  //Add an image, constrain it to a given size, and center it vertically and horizontally 
  doc.end();
}

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
  console.log(`YGOProxy is running, please visite http://localhost:${port} to make your proxies!`)
})