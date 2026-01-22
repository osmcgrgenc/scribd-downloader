import sqlite3 from 'sqlite3'
import path from 'path'
import fs from 'fs'

const DB_FILE = "history.db"

class Database {
    constructor() {
        if (!Database.instance) {
            Database.instance = this
            this.dbPath = path.resolve(process.cwd(), DB_FILE)
            this._init()
        }
        return Database.instance
    }

    _init() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error("Failed to connect to database:", err.message)
            } else {
                this._createTables()
            }
        })
    }

    _createTables() {
        const sql = `
            CREATE TABLE IF NOT EXISTS history (
                url TEXT PRIMARY KEY,
                file_path TEXT,
                title TEXT,
                created_at INTEGER
            )
        `
        this.db.run(sql, (err) => {
            if (err) console.error("Failed to create tables:", err.message)
        })
    }

    /**
     * Get a record by URL
     * @param {string} url 
     * @returns {Promise<object|null>}
     */
    get(url) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT * FROM history WHERE url = ?", [url], (err, row) => {
                if (err) reject(err)
                else resolve(row)
            })
        })
    }

    /**
     * Insert or replace a record
     * @param {string} url 
     * @param {string} filePath 
     * @param {string} title 
     */
    save(url, filePath, title = "") {
        return new Promise((resolve, reject) => {
            const sql = `INSERT OR REPLACE INTO history (url, file_path, title, created_at) VALUES (?, ?, ?, ?)`
            const now = Date.now()
            this.db.run(sql, [url, filePath, title, now], function(err) {
                if (err) reject(err)
                else resolve(this.lastID)
            })
        })
    }

    close() {
        this.db.close()
    }
}

export const database = new Database()
