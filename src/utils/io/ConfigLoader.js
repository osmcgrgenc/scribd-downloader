import fs from 'fs'
import ini from 'ini'
import path from 'path'

const CONFIG_FILE = "config.ini"

const DEFAULTS = {
    SCRIBD: {
        rendertime: 100
    },
    DIRECTORY: {
        output: "output",
        filename: "title"
    }
}

class ConfigLoader {
    constructor() {
        if (!ConfigLoader.instance) {
            this._config = this._loadFromFile()
            ConfigLoader.instance = this
        }
        return ConfigLoader.instance
    }

    _loadFromFile() {
        try {
            const configPath = path.resolve(process.cwd(), CONFIG_FILE)
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, { encoding: "utf-8" })
                return ini.parse(content)
            }
        } catch (err) {
            console.error(`Config load error: ${err.message}`)
        }
        return {}
    }

    /**
     * Get a string value from config with fallback to defaults
     * @param {string} section 
     * @param {string} key 
     * @param {string} [fallback] 
     * @returns {string}
     */
    load(section, key, fallback) {
        // 1. User config
        if (this._config[section] && this._config[section][key] !== undefined) {
            return this._config[section][key]
        }
        
        // 2. Static defaults
        if (DEFAULTS[section] && DEFAULTS[section][key] !== undefined) {
            return String(DEFAULTS[section][key])
        }

        // 3. Runtime fallback
        if (fallback !== undefined) {
            return String(fallback)
        }

        throw new Error(`Configuration missing: [${section}] ${key}`)
    }

    /**
     * Get an integer value from config
     * @param {string} section 
     * @param {string} key 
     * @param {number} [fallback] 
     * @returns {number}
     */
    loadInt(section, key, fallback) {
        const val = this.load(section, key, fallback)
        const intVal = parseInt(val, 10)
        if (isNaN(intVal)) {
             // If fallback provided and valid, return it (though load() handles fallback logic, strict parsing might fail)
             // But load() returns a string or throws. 
             // If the returned value is not a number, we throw.
             throw new Error(`Config value [${section}] ${key} is not a number: ${val}`)
        }
        return intVal
    }
}

export const configLoader = new ConfigLoader()
