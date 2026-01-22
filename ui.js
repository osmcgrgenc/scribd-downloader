import http from "http"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs/promises"
import { createReadStream, readFileSync, existsSync } from "fs"
import { app } from "./src/App.js"
import * as scribdFlag from "./src/const/ScribdFlag.js"
import { configLoader } from "./src/utils/io/ConfigLoader.js"
import { database } from "./src/utils/db/Database.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uiDir = path.join(__dirname, "ui")
const port = Number(process.env.UI_PORT || 4173)
const outputDir = configLoader.load("DIRECTORY", "output")

// Load version
let appVersion = "1.0.0"
try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf-8"))
    appVersion = pkg.version
} catch (e) {
    console.warn("Failed to load version from package.json")
}

const clients = new Set()
let activeJob = null
let jobCounter = 0
let progressCounter = 0

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
}

function sendJson(res, status, payload) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
    res.end(JSON.stringify(payload))
}

function sendEvent(res, type, data) {
    res.write(`event: ${type}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function broadcast(type, data) {
    for (const client of clients) {
        sendEvent(client, type, data)
    }
}

function createUiReporter(jobId) {
    return {
        log(message) {
            broadcast("log", { jobId, message })
        },
        error(message) {
            broadcast("log-error", { jobId, message })
        },
        createProgress(label, total) {
            const id = `progress-${jobId}-${++progressCounter}`
            broadcast("progress-start", { jobId, id, label, total })
            return {
                update(value) {
                    broadcast("progress-update", { jobId, id, value, total, label })
                },
                stop() {
                    broadcast("progress-stop", { jobId, id })
                }
            }
        }
    }
}

async function readJson(req) {
    return await new Promise((resolve, reject) => {
        let body = ""
        req.on("data", (chunk) => {
            body += chunk
            if (body.length > 1024 * 1024) {
                reject(new Error("Payload too large"))
            }
        })
        req.on("end", () => {
            if (!body) {
                resolve({})
                return
            }
            try {
                resolve(JSON.parse(body))
            } catch (err) {
                reject(err)
            }
        })
        req.on("error", reject)
    })
}

async function startJob(url, mode) {
    const jobId = `job-${Date.now()}-${++jobCounter}`
    activeJob = { id: jobId, url, startedAt: Date.now() }
    
    // Check DB first (Deduplication)
    try {
        const record = await database.get(url)
        if (record && existsSync(record.file_path)) {
            const fileName = path.basename(record.file_path)
            const downloadUrl = `/api/download/${fileName}`
            
            // Immediately complete
            broadcast("status", { 
                state: "completed", 
                jobId, 
                url, 
                output: outputDir, 
                downloadUrl,
                message: "Found in cache" 
            })
            activeJob = null
            return jobId
        }
    } catch (err) {
        console.error("DB Error:", err)
    }

    broadcast("status", { state: "running", jobId, url, output: outputDir })

    const reporter = createUiReporter(jobId)
    reporter.log(`Started: ${url}`)

    const flag = mode === "image" ? scribdFlag.IMAGE : undefined
    void (async () => {
        try {
            const outputPath = await app.execute(url, flag, reporter)
            
            // Save to DB
            const fileName = path.basename(outputPath)
            await database.save(url, outputPath)
            
            const downloadUrl = `/api/download/${fileName}`
            broadcast("status", { 
                state: "completed", 
                jobId, 
                url, 
                downloadUrl 
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            reporter.error(message)
            broadcast("status", { state: "failed", jobId, url })
        } finally {
            activeJob = null
        }
    })()

    return jobId
}

const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`)
    const { pathname } = requestUrl

    // 1. SSE Stream
    if (pathname === "/api/stream" && req.method === "GET") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        })
        sendEvent(res, "status", {
            state: activeJob ? "running" : "idle",
            jobId: activeJob?.id || null,
            url: activeJob?.url || null,
            output: outputDir
        })
        clients.add(res)
        req.on("close", () => {
            clients.delete(res)
        })
        return
    }

    // 2. Config & Info API
    if (pathname === "/api/config" && req.method === "GET") {
        sendJson(res, 200, { 
            output: outputDir,
            version: appVersion,
            appName: "Lifinize Downloader"
        })
        return
    }

    // 3. Start Job API
    if (pathname === "/api/start" && req.method === "POST") {
        if (activeJob) {
            sendJson(res, 409, { error: "A download is already running." })
            return
        }
        try {
            const body = await readJson(req)
            const url = typeof body.url === "string" ? body.url.trim() : ""
            const mode = body.mode === "image" ? "image" : "default"
            if (!url) {
                sendJson(res, 400, { error: "URL is required." })
                return
            }
            const jobId = await startJob(url, mode)
            sendJson(res, 202, { jobId })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(res, 400, { error: message })
        }
        return
    }

    // 4. File Download API
    if (pathname.startsWith("/api/download/") && req.method === "GET") {
        const fileName = decodeURIComponent(pathname.replace("/api/download/", ""))
        
        // Security check: Prevent directory traversal
        if (fileName.includes("..") || fileName.includes("/")) {
            res.writeHead(403)
            res.end("Access Denied")
            return
        }

        const filePath = path.join(outputDir, fileName)
        
        try {
            if (!existsSync(filePath)) {
                res.writeHead(404)
                res.end("File not found")
                return
            }

            const stat = await fs.stat(filePath)
            res.writeHead(200, {
                "Content-Type": "application/octet-stream",
                "Content-Length": stat.size,
                "Content-Disposition": `attachment; filename="${fileName}"`
            })
            
            createReadStream(filePath).pipe(res)
        } catch (err) {
            console.error("Download error:", err)
            res.writeHead(500)
            res.end("Internal Server Error")
        }
        return
    }

    // 5. Static Files
    if (req.method === "GET") {
        const safePath = pathname === "/" ? "/index.html" : pathname
        const resolvedPath = path.resolve(uiDir, `.${safePath}`)
        if (!resolvedPath.startsWith(uiDir)) {
            res.writeHead(403)
            res.end("Forbidden")
            return
        }
        try {
            const ext = path.extname(resolvedPath)
            const contentType = contentTypes[ext] || "application/octet-stream"
            const file = await fs.readFile(resolvedPath)
            res.writeHead(200, { "Content-Type": contentType })
            res.end(file)
        } catch (error) {
            res.writeHead(404)
            res.end("Not found")
        }
        return
    }

    res.writeHead(405)
    res.end("Method not allowed")
})

server.listen(port, () => {
    console.log(`UI running at http://localhost:${port}`)
    console.log(`Version: ${appVersion}`)
})
