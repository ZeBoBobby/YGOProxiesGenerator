PDFDocument = require('pdfkit');
fs = require('fs');
Path = require('path');
Axios = require('axios');
doc = new PDFDocument({
    size: 'A4',
    margin: 5
});


//Permet de récupérer des images de cartes
async function downloadImage(prmIdCard) {
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

//console.log(fs.existsSync('./images/10045474.jpg'));

decklist = require('./deck.json');

const downloadImages = async _ => {

    for (let i = 0; i < decklist.length; i++) {
        if(decklist[i].charAt(0) === "0") {
            decklist[i] = decklist[i].slice(1);
        }
        const path = './images/' + decklist[i] + '.jpg';
        if(!fs.existsSync(path)) {
            console.log(decklist[i]);
            await downloadImage(decklist[i]);
        }
    }

}

const makePdfProxies = async _ => {
        //Pipe its output somewhere, like to a file or HTTP response 
        //See below for browser usage 
        doc.pipe(fs.createWriteStream('output.pdf'))

        let x = 32;
        let y = 32;
        let width = 173;
        let height = 252;

        for (let i = 0; i < decklist.length; i++) {
            // console.log("i : " + i);
            // console.log("x : " + x);
            // console.log("y : " + y);
            // console.log("mod : " + i % 3);
            console.log(decklist[i]);

            const path = './images/' + decklist[i] + '.jpg';

            if (i % 3 !== 0) {
                x = x + width + 5;
                //y = y + height;   
            } else if (i !== 0) {
                x = 32;
                y = y + height + 5;
            }
            if (y + height > 842) {
                y = 32;
                x = 32;
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


downloadImages().then(e => {
    makePdfProxies();
}).catch(error => console.error(error));