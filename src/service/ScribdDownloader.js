import { BaseDownloader } from '../core/BaseDownloader.js'
import { puppeteerSg } from "../utils/request/PuppeteerSg.js"
import { pdfGenerator } from "../utils/io/PdfGenerator.js"
import { configLoader } from "../utils/io/ConfigLoader.js"
import { directoryIo } from "../utils/io/DirectoryIo.js"
import { cliReporter } from "../utils/Reporter.js"
import * as scribdRegex from "../const/ScribdRegex.js"
import * as scribdFlag from '../const/ScribdFlag.js'
import { Image } from "../object/Image.js"
import sharp from "sharp"
import path from 'path'
import sanitize from "sanitize-filename"

class ScribdDownloader extends BaseDownloader {
    constructor() {
        super()
        if (!ScribdDownloader.instance) {
            ScribdDownloader.instance = this
            this.output = configLoader.load("DIRECTORY", "output", "output")
            this.filename = configLoader.load("DIRECTORY", "filename", "title")
            this.rendertime = configLoader.loadInt("SCRIBD", "rendertime", 100)
        }
        return ScribdDownloader.instance
    }

    /**
     * @param {string} url 
     * @param {string} flag 
     * @param {object} reporter 
     */
    async execute(url, flag, reporter = cliReporter) {
        let executionMethod
        if (flag === scribdFlag.IMAGE) {
            reporter.log("Mode: IMAGE")
            executionMethod = this._embedsImage.bind(this)
        } else {
            reporter.log("Mode: DEFAULT")
            executionMethod = this._embedsDefault.bind(this)
        }

        const docMatch = scribdRegex.DOCUMENT.exec(url)
        const embedMatch = scribdRegex.EMBED.exec(url)

        if (docMatch) {
            const id = docMatch[2]
            const embedUrl = `https://www.scribd.com/embeds/${id}/content`
            await executionMethod(embedUrl, reporter)
        } else if (embedMatch) {
            await executionMethod(url, reporter)
        } else {
            throw new Error(`Unsupported URL format: ${url}`)
        }
    }

    async _embedsDefault(url, reporter) {
        const m = scribdRegex.EMBED.exec(url)
        if (!m) throw new Error(`Invalid embed URL: ${url}`)
        
        const id = m[1]
        let page

        try {
            // 1. Navigate
            page = await puppeteerSg.getPage(url)
            await this.wait(1000)

            // 2. Extract Title
            let title = id
            try {
                const overlaySelector = await page.$("div.mobile_overlay a")
                if (overlaySelector) {
                    const href = await overlaySelector.evaluate(el => el.href)
                    title = decodeURIComponent(href.split('/').pop().trim())
                }
            } catch (ignored) {
                // Fallback to ID if title extraction fails
            }

            const identifier = `${sanitize(this.filename === "title" ? title : id)}`
            const tempDir = path.join(this.output, identifier)

            // 3. Cleanup UI (Cookie banners)
            const cookieSelectors = ["div.customOptInDialog", "div[aria-label='Cookie Consent Banner']"]
            for (const selector of cookieSelectors) {
                const elements = await page.$$(selector)
                for (const el of elements) {
                    await el.evaluate(node => node.remove())
                }
            }

            // 4. Scroll & Load All Pages
            reporter.log("Loading all pages...")
            
            const docScroller = await page.$('div.document_scroller')
            if (!docScroller) throw new Error("Document scroller not found")
            
            // Trigger initial scroll interaction
            await docScroller.click()
            
            const scrollHeight = await docScroller.evaluate(el => el.scrollHeight)
            const clientHeight = await docScroller.evaluate(el => el.clientHeight)
            
            const loadProgress = reporter.createProgress("Load pages", scrollHeight)
            let scrollTop = await docScroller.evaluate(el => el.scrollTop)
            
            // Scroll loop
            while (scrollTop + clientHeight < scrollHeight) {
                await page.keyboard.press('PageDown')
                await this.wait(this.rendertime)
                scrollTop = await docScroller.evaluate(el => el.scrollTop)
                loadProgress.update(Math.round(scrollTop + clientHeight))
            }
            loadProgress.update(scrollHeight)
            loadProgress.stop()

            // 5. Prepare pages for PDF generation
            // Remove margins
            const pageSelectors = await page.$$("div.outer_page_container div[id^='outer_page_']")
            for (let i = 0; i < pageSelectors.length; i++) {
                await page.evaluate((index) => {
                    const el = document.getElementById(`outer_page_${index + 1}`)
                    if (el) el.style.margin = "0"
                }, i)
            }

            // Isolate content
            await page.evaluate(() => {
                const container = document.querySelector("div.outer_page_container")
                if (container) document.body.innerHTML = container.innerHTML
            })

            // Hide all initially
            for (let i = 0; i < pageSelectors.length; i++) {
                await page.evaluate((index) => {
                    const el = document.getElementById(`outer_page_${index + 1}`)
                    if (el) el.style.display = 'none'
                }, i)
            }

            // 6. Generate PDFs Per Page
            reporter.log("Generating per-page PDFs...")
            const pdfProgress = reporter.createProgress("Generate PDFs", pageSelectors.length)
            
            const pdfPaths = []
            await directoryIo.create(tempDir)

            for (let i = 0; i < pageSelectors.length; i++) {
                // Show single page
                await page.evaluate((index) => {
                    const el = document.getElementById(`outer_page_${index + 1}`)
                    if (el) el.style.display = 'block'
                }, i)

                // Get dimensions
                const pageId = `outer_page_${i + 1}`
                const pageSelector = await page.$(`#${pageId}`)
                const style = await pageSelector.evaluate(el => el.getAttribute("style"))
                
                // Parse W/H
                const getStyleVal = (str, key) => {
                    const part = str.split(`${key}:`)[1]
                    return part ? parseInt(part.split("px")[0].trim()) : 0
                }
                
                let width = getStyleVal(style, "width")
                let height = getStyleVal(style, "height")
                
                // Correction for odd height
                if (height % 2 !== 0) height += 1

                const pagePdfPath = path.join(tempDir, `${("00" + i).slice(-3)}.pdf`)
                
                await page.pdf({
                    path: pagePdfPath,
                    width: width,
                    height: height,
                    printBackground: true,
                    timeout: 0
                })
                
                pdfPaths.push(pagePdfPath)

                // Hide again
                await page.evaluate((index) => {
                    const el = document.getElementById(`outer_page_${index + 1}`)
                    if (el) el.style.display = 'none'
                }, i)

                pdfProgress.update(i + 1)
            }
            pdfProgress.stop()

            // 7. Merge PDFs
            reporter.log("Merging PDFs...")
            const finalPdfPath = path.join(this.output, `${identifier}.pdf`)
            await pdfGenerator.merge(pdfPaths, finalPdfPath)
            reporter.log(`Generated: ${finalPdfPath}`)

            // 8. Cleanup
            await directoryIo.remove(tempDir)

        } catch (error) {
            throw error
        } finally {
            if (page) await page.close()
        }
    }

    async _embedsImage(url, reporter) {
        const m = scribdRegex.EMBED.exec(url)
        if (!m) throw new Error(`Invalid embed URL: ${url}`)

        const id = m[1]
        let page
        
        try {
            // 1. Navigate
            page = await puppeteerSg.getPage(url)
            await this.wait(1000)

            // 2. Extract Title
            let title = id
            try {
                const div = await page.$("div.mobile_overlay a")
                if (div) {
                    const href = await div.evaluate(el => el.href)
                    title = decodeURIComponent(href.split('/').pop().trim())
                }
            } catch (ignored) {}

            const identifier = `${sanitize(this.filename === "title" ? title : id)}`
            const tempDir = path.join(this.output, id) // Use ID for temp dir to avoid collisions? Or identifier? Original used ID.
            await directoryIo.create(tempDir)

            // 3. Hide blockers
            const docScroller = await page.$("div.document_scroller")
            if (docScroller) {
                await docScroller.evaluate(el => {
                    el.style.bottom = "0px"
                    el.style.marginTop = "0px"
                })
            }
            
            const toolbarDrop = await page.$("div.toolbar_drop")
            if (toolbarDrop) {
                await toolbarDrop.evaluate(el => el.style.display = "none")
            }

            // 4. Download Images
            const docOuterPages = await page.$$("div.outer_page_container div[id^='outer_page_']")
            const images = []
            
            reporter.log("Capturing pages as images...")
            const imageProgress = reporter.createProgress("Capture pages", docOuterPages.length)
            
            const deviceScaleFactor = 2
            
            for (let i = 0; i < docOuterPages.length; i++) {
                // Scroll into view
                await page.evaluate((index) => {
                    const el = document.getElementById(`outer_page_${index + 1}`)
                    if (el) el.scrollIntoView()
                }, i)

                // Calculate Viewport
                const defaultWidth = 1191
                let height = 1684
                
                const style = await docOuterPages[i].evaluate(el => el.getAttribute("style"))
                if (style && style.includes("width:") && style.includes("height:")) {
                    const w = parseInt(style.split("width:")[1].split("px")[0].trim())
                    const h = parseInt(style.split("height:")[1].split("px")[0].trim())
                    // Ratio calculation
                    if (w > 0) height = Math.ceil(defaultWidth * h / w)
                }

                await page.setViewport({ width: defaultWidth, height: height, deviceScaleFactor })

                const imagePath = path.join(tempDir, `${(i + 1).toString().padStart(4, '0')}.png`)
                await docOuterPages[i].screenshot({ path: imagePath })

                const metadata = await sharp(imagePath).metadata()
                images.push(new Image(imagePath, metadata.width, metadata.height))
                
                imageProgress.update(i + 1)
            }
            imageProgress.stop()

            // 5. Generate PDF
            const finalPdfPath = path.join(this.output, `${identifier}.pdf`)
            reporter.log("Generating PDF from images...")
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

export const scribdDownloader = new ScribdDownloader()
