const PDFDocument = require('pdfkit');
const express = require('express')
const app = express()
const fs = require('fs');
const Path = require('path');
const Axios = require('axios');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const _ = require('lodash');
const pdfFolder = `${__dirname}/pdf`;

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

app.use(express.static('pdf'));

app.set('view engine', 'ejs');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(morgan('dev'));

app.post('/upload-decklist', async (req, res) => {
  console.log(req.files.deckfile);
  try {
    if (!req.files) {
      res.render('pages/success', {
        success: ''
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
            success: 'success'
          });
        }).catch(error => {
          console.error(error)
          res.render('pages/success', {
            success: ''
          });
        });
      })

      //send response
      // res.send({
      //     status: true,
      //     message: 'File is uploaded' + fileLocation,
      //     data: {
      //         name: deckfile.name,
      //         mimetype: deckfile.mimetype,
      //         size: deckfile.size
      //     }
      // });
    }
  } catch (err) {
    res.status(500).send(err);
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
  if ((prmString.includes('#') || prmString.includes('!')) || prmString.length < 4) {
    return false;
  }
  return true;
}

// var decklist = require('./deck.json');

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
  // await fs.readFile('./decklist.ydk', function(err, data) {
  //     if(err) throw err;
  //     decklist = data.toString().split("\n").filter(elm => onlyCardsId(elm));
  // });
  decklist = fs.readFileSync(prmDeckfile).toString().split("\n").filter(elm => onlyCardsId(elm)).map(elm => elm.trim());
  console.log(decklist);

  for (let i = 0; i < decklist.length; i++) {
    decklist[i] = removeFirstZero(decklist[i]);

    const path = './images/' + decklist[i] + '.jpg';
    if (!fs.existsSync(path)) {
      console.log(decklist[i]);
      await downloadImage(decklist[i]);
    }
  }

}

const makePdfProxies = async prmFileName => {

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0
  });
  //Pipe its output somewhere, like to a file or HTTP response 
  //See below for browser usage 
  doc.pipe(fs.createWriteStream(pdfFolder + '/' + prmFileName))

  let x = 40;
  let y = 40;
  let width = 173;
  let height = 252;
  let margin = 0;

  console.log("PDF file creation...");
  for (let i = 0; i < decklist.length; i++) {
    // console.log("i : " + i);
    // console.log("x : " + x);
    // console.log("y : " + y);
    // console.log("mod : " + i % 3);
    console.log(decklist[i]);

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
      doc.addPage().image('./images/' + decklist[i] + '.jpg', x, y, {
        fit: [width, height],
        //    align: 'center',
        //    valign: 'center'
      });
    } else {
      doc.image('./images/' + decklist[i] + '.jpg', x, y, {
        fit: [width, height],
        //    align: 'center',
        //    valign: 'center'
      });
    }
  }
  //Add an image, constrain it to a given size, and center it vertically and horizontally 
  doc.end();
}


// downloadImages().then(e => {
//     makePdfProxies();
//     console.log("All done!");
// }).catch(error => console.error(error));

app.get('/', (req, res) => {
  res.render('pages/index');
})

app.use(function (req, res, next) {
  res.status(404);
  res.render('pages/404');
});


app.listen(8080, () => {
  console.log(`YGOProxy is running, please visite http://localhost.8080 to make your proxies!`)
})