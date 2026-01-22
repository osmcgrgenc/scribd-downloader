import { BaseDownloader } from '../core/BaseDownloader.js'
import { puppeteerSg } from "../utils/request/PuppeteerSg.js"
import { configLoader } from "../utils/io/ConfigLoader.js"
import { directoryIo } from "../utils/io/DirectoryIo.js"
import { cliReporter } from "../utils/Reporter.js"
import * as everandRegex from "../const/EverandRegex.js"
import axios from "axios"
import fs from "fs"
import path from 'path'
import sanitize from "sanitize-filename"

class EverandDownloader extends BaseDownloader {
    constructor() {
        super()
        if (!EverandDownloader.instance) {
            EverandDownloader.instance = this
            this.output = configLoader.load("DIRECTORY", "output", "output")
        }
        return EverandDownloader.instance
    }

    /**
     * @param {string} url 
     * @param {object} reporter 
     */
    async execute(url, reporter = cliReporter) {
        if (url.match(everandRegex.PODCAST_SERIES)) {
            await this._processSeries(url, reporter)
        } else if (url.match(everandRegex.PODCAST_EPISODE)) {
            const id = everandRegex.PODCAST_EPISODE.exec(url)[1]
            await this._processListen(`https://www.everand.com/listen/podcast/${id}`, true, reporter)
        } else if (url.match(everandRegex.PODCAST_LISTEN)) {
            await this._processListen(url, true, reporter)
        } else {
            throw new Error(`Unsupported URL: ${url}`)
        }
    }

    async _processListen(url, isStandalone, reporter) {
        const listenMatch = everandRegex.PODCAST_LISTEN.exec(url)
        if (!listenMatch) throw new Error("Invalid listen URL")

        const episodeId = listenMatch[1]
        let page
        
        try {
            // 1. Navigate
            page = await puppeteerSg.getPage(url)
            await this.wait(1000)

            // 2. Extract Info
            const title = await page.evaluate(() => {
                // @ts-ignore
                return window.Scribd?.current_doc?.short_title || "Unknown Title"
            })
            
            const audioUrl = await page.evaluate(() => {
                const audio = document.querySelector('audio#audioplayer')
                // @ts-ignore
                return audio ? audio.src : null
            })

            if (!audioUrl) throw new Error("Audio source not found on page.")

            const seriesUrl = await page.evaluate(() => {
                const link = document.querySelector('a[href^="https://www.everand.com/podcast-show/"]')
                // @ts-ignore
                return link ? link.href : null
            })
            
            if (!seriesUrl) throw new Error("Series URL not found.")

            // 3. Prepare Directory
            const seriesMatch = everandRegex.PODCAST_SERIES.exec(seriesUrl)
            const seriesId = seriesMatch ? seriesMatch[1] : "Unknown_Series"
            const dir = path.join(this.output, seriesId)
            
            await directoryIo.create(dir)

            // 4. Download Audio
            if (isStandalone) {
                reporter.log("Downloading episode audio...")
            }
            
            const safeTitle = sanitize(title)
            const filePath = path.join(dir, `${episodeId}_${safeTitle}.mp3`)
            
            const resp = await axios.get(audioUrl, { responseType: 'stream' })
            
            await new Promise((resolve, reject) => {
                const writer = fs.createWriteStream(filePath)
                resp.data.pipe(writer)
                writer.on('finish', resolve)
                writer.on('error', reject)
            })

            if (isStandalone) {
                reporter.log(`Saved: ${filePath}`)
            }

        } catch (error) {
            throw error
        } finally {
            if (page && isStandalone) {
                // Only close page if it's a standalone call. 
                // However, logic below suggests we should close page regardless of context if we opened it here?
                // The original code passed 'isEpisode' (standalone) to decide whether to close puppeteer entirely.
                // Here we just close the page. PuppeteerSg manages browser lifecycle.
                await page.close()
                if (isStandalone) {
                     // In standalone mode, we might want to close browser if it was just for this task?
                     // PuppeteerSg is singleton, so maybe we don't force close browser here to allow reuse?
                     // Original code: await puppeteerSg.close() if isEpisode.
                     // Let's stick to closing page. If the app is done, the process exit will close browser.
                }
            } else if (page) {
                await page.close()
            }
        }
    }

    async _processSeries(url, reporter) {
        let page
        try {
            // 1. Navigate
            page = await puppeteerSg.getPage(url)
            await this.wait(1000)

            reporter.log("Processing podcast series...")

            // 2. Get Metadata
            const totalEpisodeText = await page.evaluate(() => {
                const el = document.querySelector('span[data-e2e="podcast-series-header-total-episodes"]')
                return el ? el.textContent : "0 episodes"
            })
            
            const totalEpisode = parseInt(totalEpisodeText.replace("episodes", "").trim()) || 0
            
            const totalPageText = await page.evaluate(() => {
                const links = [...document.querySelectorAll('div[data-e2e="pagination"] a[aria-label^="Page"]')]
                return links.length > 0 ? links.at(-1).textContent : "1"
            })
            
            const totalPage = parseInt(totalPageText) || 1

            reporter.log(`Series total episodes: ${totalEpisode}`)
            
            const seriesProgress = reporter.createProgress("Download episodes", totalEpisode)
            
            // 3. Iterate Pages
            for (let i = 1; i <= totalPage; i++) {
                if (i > 1) {
                    await page.goto(`${url}?page=${i}&sort=desc`, { waitUntil: "domcontentloaded" })
                    await this.wait(1000)
                }

                const episodes = await page.evaluate(() => {
                    const links = [...document.querySelectorAll('div.breakpoint_hide.below a[data-e2e="podcast-episode-player-button"]')]
                    // @ts-ignore
                    return links.map(x => x.href)
                })

                for (let j = 0; j < episodes.length; j++) {
                    // Reuse _processListen but as part of series (isStandalone = false)
                    // We need to manage the page/browser carefully. 
                    // Since _processListen opens a NEW page, it's safe to call.
                    await this._processListen(episodes[j], false, reporter)
                    
                    const completedCount = ((i - 1) * 10) + (j + 1)
                    seriesProgress.update(completedCount)
                }
            }
            seriesProgress.stop()

        } catch (error) {
            throw error
        } finally {
            if (page) await page.close()
        }
    }
}

export const everandDownloader = new EverandDownloader()
