import { puppeteerSg } from "../utils/request/PuppeteerSg.js";
import { pdfGenerator } from "../utils/io/PdfGenerator.js";
import { configLoader } from "../utils/io/ConfigLoader.js";
import { directoryIo } from "../utils/io/DirectoryIo.js"
import * as slideshareRegex from "../const/SlideshareRegex.js"
import { Image } from "../object/Image.js"
import sharp from "sharp";
import axios from "axios";
import fs from "fs"
import sanitize from "sanitize-filename";
import { cliReporter } from "../utils/Reporter.js"


const output = configLoader.load("DIRECTORY", "output")
const filename = configLoader.load("DIRECTORY", "filename")

class SlideshareDownloader {
    constructor() {
        if (!SlideshareDownloader.instance) {
            SlideshareDownloader.instance = this
        }
        return SlideshareDownloader.instance
    }

    async execute(url, reporter = cliReporter) {
        if (url.match(slideshareRegex.SLIDESHOW)) {
            await this.slideshow(url, slideshareRegex.SLIDESHOW.exec(url)[1], reporter)
        } else if (url.match(slideshareRegex.PPT)) {
            await this.slideshow(url, slideshareRegex.PPT.exec(url)[1], reporter)
        } else {
            throw new Error(`Unsupported URL: ${url}`)
        }
    }

    async slideshow(url, id, reporter) {
        // prepare temp dir
        const dir = `${output}/${id}`
        await directoryIo.create(dir)

        // navigate to slideshare
        const page = await puppeteerSg.getPage(url)

        // wait rendering
        await new Promise(resolve => setTimeout(resolve, 1000))

        // get the title
        const h1 = await page.$("h1.title")
        const title = decodeURIComponent(await h1.evaluate((el) => el.textContent.trim()))

        // get slides images
        const srcs = await page.$$eval("img[id^='slide-image-']", imgs => imgs.map(img => img.src));

        // iterate all images
        const images = []
        reporter.log("Downloading slides...")
        const imageProgress = reporter.createProgress("Download slides", srcs.length)
        for (let i = 0; i < srcs.length; i++) {
            const src = srcs[i];
            const path = `${dir}/${(i + 1).toString().padStart(4, '0')}.png`

            // convert the webp (even it shows jpg) to png
            const resp = await axios.get(src, { responseType: 'arraybuffer' })
            const imageBuffer = await sharp(resp.data).toFormat('png').toBuffer();
            fs.writeFileSync(path, Buffer.from(imageBuffer, 'binary'))

            const metadata = await sharp(path).metadata();
            images.push(new Image(path, metadata.width, metadata.height));
            imageProgress.update(i + 1);
        }
        imageProgress.stop();

        // generate pdf
        const outputPath = `${output}/${sanitize(filename == "title" ? title : id)}.pdf`
        reporter.log("Generating PDF...")
        await pdfGenerator.generate(images, outputPath, reporter)

        // remove temp dir
        directoryIo.remove(`${dir}`)

        await page.close()
        await puppeteerSg.close()
    }
}

export const slideshareDownloader = new SlideshareDownloader()
