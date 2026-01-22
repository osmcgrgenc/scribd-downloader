import { BaseDownloader } from '../core/BaseDownloader.js'
import { puppeteerSg } from "../utils/request/PuppeteerSg.js"
import { pdfGenerator } from "../utils/io/PdfGenerator.js"
import { configLoader } from "../utils/io/ConfigLoader.js"
import { directoryIo } from "../utils/io/DirectoryIo.js"
import { cliReporter } from "../utils/Reporter.js"
import * as slideshareRegex from "../const/SlideshareRegex.js"
import { Image } from "../object/Image.js"
import sharp from "sharp"
import axios from "axios"
import fs from "fs"
import path from 'path'
import sanitize from "sanitize-filename"

class SlideshareDownloader extends BaseDownloader {
    constructor() {
        super()
        if (!SlideshareDownloader.instance) {
            SlideshareDownloader.instance = this
            this.output = configLoader.load("DIRECTORY", "output", "output")
            this.filename = configLoader.load("DIRECTORY", "filename", "title")
        }
        return SlideshareDownloader.instance
    }

    /**
     * @param {string} url 
     * @param {object} reporter 
     */
    async execute(url, reporter = cliReporter) {
        const slideshowMatch = slideshareRegex.SLIDESHOW.exec(url)
        const pptMatch = slideshareRegex.PPT.exec(url)

        if (slideshowMatch) {
            await this._processSlideshow(url, slideshowMatch[1], reporter)
        } else if (pptMatch) {
            await this._processSlideshow(url, pptMatch[1], reporter)
        } else {
            throw new Error(`Unsupported URL: ${url}`)
        }
    }

    async _processSlideshow(url, id, reporter) {
        const tempDir = path.join(this.output, id)
        let page

        try {
            await directoryIo.create(tempDir)

            // 1. Navigate
            page = await puppeteerSg.getPage(url)
            await this.wait(1000)

            // 2. Extract Title
            let title = id
            try {
                const h1 = await page.$("h1.title")
                if (h1) {
                    title = decodeURIComponent(await h1.evaluate(el => el.textContent.trim()))
                }
            } catch (err) {
                // Ignore title extraction failure
            }

            // 3. Extract Image Sources
            const srcs = await page.$$eval("img[id^='slide-image-']", imgs => imgs.map(img => img.src))
            
            if (!srcs || srcs.length === 0) {
                throw new Error("No slides found to download.")
            }

            // 4. Download & Convert Images
            const images = []
            reporter.log("Downloading slides...")
            const imageProgress = reporter.createProgress("Download slides", srcs.length)

            for (let i = 0; i < srcs.length; i++) {
                const src = srcs[i]
                const imgPath = path.join(tempDir, `${(i + 1).toString().padStart(4, '0')}.png`)

                try {
                    const resp = await axios.get(src, { responseType: 'arraybuffer' })
                    // Convert WebP/JPG to PNG for consistent PDF generation
                    const imageBuffer = await sharp(resp.data).toFormat('png').toBuffer()
                    fs.writeFileSync(imgPath, Buffer.from(imageBuffer, 'binary'))

                    const metadata = await sharp(imgPath).metadata()
                    images.push(new Image(imgPath, metadata.width, metadata.height))
                } catch (err) {
                    reporter.error(`Failed to download slide ${i + 1}: ${err.message}`)
                }
                
                imageProgress.update(i + 1)
            }
            imageProgress.stop()

            // 5. Generate PDF
            const finalPdfPath = path.join(this.output, `${sanitize(this.filename === "title" ? title : id)}.pdf`)
            reporter.log("Generating PDF...")
            await pdfGenerator.generate(images, finalPdfPath, reporter)

            // 6. Cleanup
            await directoryIo.remove(tempDir)

        } catch (error) {
            throw error
        } finally {
            if (page) await page.close()
        }
    }
}

export const slideshareDownloader = new SlideshareDownloader()
