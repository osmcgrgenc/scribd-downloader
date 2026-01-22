import { cliReporter } from "../utils/Reporter.js"

export class BaseDownloader {
    /**
     * @param {string} url
     * @param {string|object} [options]
     * @param {object} [reporter]
     */
    async execute(url, options, reporter = cliReporter) {
        throw new Error("Method 'execute' must be implemented.")
    }

    /**
     * Helper to wait for a specified time
     * @param {number} ms 
     */
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
