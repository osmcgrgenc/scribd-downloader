import { scribdDownloader } from "./service/ScribdDownloader.js"
import { slideshareDownloader } from "./service/SlideshareDownloader.js"
import { everandDownloader } from "./service/EverandDownloader.js"
import * as scribdRegex from "./const/ScribdRegex.js"
import * as slideshareRegex from "./const/SlideshareRegex.js"
import * as everandRegex from "./const/EverandRegex.js"
import { cliReporter } from "./utils/Reporter.js"

class App {
    constructor() {
        if (!App.instance) {
            App.instance = this
        }
        return App.instance
    }

    async execute(url, flag, reporter = cliReporter) {
        if (!url) {
            throw new Error("URL cannot be empty")
        }

        try {
            if (url.match(scribdRegex.DOMAIN)) {
                await scribdDownloader.execute(url, flag, reporter)
            } else if (url.match(slideshareRegex.DOMAIN)) {
                await slideshareDownloader.execute(url, reporter)
            } else if (url.match(everandRegex.DOMAIN)) {
                await everandDownloader.execute(url, reporter)
            } else {
                throw new Error(`Unsupported URL: ${url}`)
            }
        } catch (error) {
            // Ensure error propagates to caller (CLI or UI) for handling
            throw error
        }
    }
}

export const app = new App()
