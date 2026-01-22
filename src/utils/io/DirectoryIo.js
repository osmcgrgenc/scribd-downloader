import { mkdir, rm } from 'fs/promises'

class DirectoryIo {
    constructor() {
        if (!DirectoryIo.instance) {
            DirectoryIo.instance = this
        }
        return DirectoryIo.instance
    }

    /**
     * Create directories recursively
     * @param {string} dest - Directory path
     */
    async create(dest) {
        try {
            await mkdir(dest, { recursive: true })
        } catch (err) {
            throw new Error(`Failed to create directory ${dest}: ${err.message}`)
        }
    }

    /**
     * Remove directories recursively
     * @param {string} dest - Directory path
     */
    async remove(dest) {
        try {
            await rm(dest, { recursive: true, force: true })
        } catch (err) {
            // Warn but don't crash on cleanup failure usually
            console.warn(`Failed to cleanup directory ${dest}: ${err.message}`)
        }
    }
}

export const directoryIo = new DirectoryIo()
