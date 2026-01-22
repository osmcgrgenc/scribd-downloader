const $ = (selector) => document.querySelector(selector)

const els = {
  form: $("#download-form"),
  urlInput: $("#url-input"),
  statusText: $("#status-text"),
  statusDot: $("#status-dot"),
  outputPath: $("#output-path"),
  connectionState: $("#connection-state"),
  activeJobId: $("#active-job-id"),
  progressList: $("#progress-list"),
  logList: $("#log"),
  startButton: $("#start-button"),
  clearLogButton: $("#clear-log"),
  downloadContainer: $("#download-container"),
  downloadLink: $("#download-link")
}

const appState = {
  jobId: null,
  running: false
}

const progressMap = new Map()
const statusLabels = {
  idle: "Idle",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  disconnected: "Disconnected"
}
const maxLogLines = 200

function setConnectionState(state) {
  if (!els.connectionState) return
  
  const label = state === "down" ? "Disconnected" : "Live"
  els.connectionState.textContent = label
  els.connectionState.style.color = state === "down" ? "var(--error)" : "var(--success)"
}

function setBusy(isBusy) {
  appState.running = isBusy
  if (els.startButton) {
    els.startButton.disabled = isBusy
    const btnSpan = els.startButton.querySelector("span")
    if (btnSpan) {
        btnSpan.textContent = isBusy ? "Processing..." : "Start Download Process"
    } else {
        els.startButton.textContent = isBusy ? "Processing..." : "Start Download Process"
    }
  }
}

function setStatus(state, label) {
  const text = label || statusLabels[state] || "Idle"
  
  if (els.statusText) {
    els.statusText.textContent = text
  }

  if (els.statusDot) {
    els.statusDot.className = "status-dot"
    if (state === "running" || state === "queued") {
      els.statusDot.classList.add("active")
    } else if (state === "failed" || state === "disconnected") {
      els.statusDot.classList.add("error")
    } else {
      els.statusDot.classList.add("idle")
    }
  }

  setBusy(state === "running" || state === "queued")
}

function setActiveJobId(id) {
    if (els.activeJobId) {
        els.activeJobId.textContent = id || "None"
    }
}

function showDownloadLink(url) {
    if (els.downloadContainer && els.downloadLink && url) {
        els.downloadLink.href = url
        els.downloadContainer.style.display = "block"
        // Optional: Trigger a pulse animation
        els.downloadLink.classList.add("pulse")
    }
}

function hideDownloadLink() {
    if (els.downloadContainer) {
        els.downloadContainer.style.display = "none"
    }
}

function clearProgress() {
  progressMap.clear()
  if (els.progressList) els.progressList.innerHTML = ""
}

function clearLogs() {
  if (els.logList) els.logList.innerHTML = ""
}

function resetRun() {
  appState.jobId = null
  setActiveJobId(null)
  clearProgress()
  clearLogs()
  hideDownloadLink()
}

function formatTime(date) {
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

function addLog(message, isError = false) {
  if (!els.logList) return

  const line = document.createElement("div")
  line.className = `log-entry${isError ? " error" : ""}`
  line.textContent = `[${formatTime(new Date())}] ${message}`
  els.logList.appendChild(line)

  while (els.logList.children.length > maxLogLines) {
    els.logList.removeChild(els.logList.firstChild)
  }
  els.logList.scrollTop = els.logList.scrollHeight
}

function createProgressRow(id, label, total) {
  if (!els.progressList) return

  const item = document.createElement("div")
  item.className = "progress-item"
  item.dataset.progressId = id

  const header = document.createElement("div")
  header.className = "progress-header"
  
  const titleSpan = document.createElement("span")
  titleSpan.textContent = label
  
  const metaSpan = document.createElement("span")
  const totalLabel = typeof total === "number" ? total : "?"
  metaSpan.textContent = `0 / ${totalLabel}`
  
  header.appendChild(titleSpan)
  header.appendChild(metaSpan)

  const track = document.createElement("div")
  track.className = "progress-track"
  
  const fill = document.createElement("div")
  fill.className = "progress-fill"
  
  track.appendChild(fill)
  item.appendChild(header)
  item.appendChild(track)

  els.progressList.appendChild(item)
  progressMap.set(id, { fill, meta: metaSpan, total, item })
}

function updateProgressRow(id, value, total) {
  const entry = progressMap.get(id)
  if (!entry) return

  const safeTotal = typeof total === "number" ? total : entry.total
  const safeValue = Math.max(0, Math.min(value, safeTotal || value))
  const percentage = safeTotal ? Math.round((safeValue / safeTotal) * 100) : 0
  
  entry.fill.style.width = `${percentage}%`
  entry.meta.textContent = `${safeValue} / ${safeTotal || "?"}`
}

function completeProgressRow(id) {
  const entry = progressMap.get(id)
  if (!entry) return
  
  entry.fill.style.width = "100%"
}

function isRelevantJob(jobId) {
  return !jobId || !appState.jobId || jobId === appState.jobId
}

if (els.form) {
  els.form.addEventListener("submit", async (event) => {
    event.preventDefault()
    const url = els.urlInput.value.trim()
    if (!url) {
      addLog("Please enter a URL before starting.", true)
      return
    }
    const mode = els.form.querySelector("input[name=\"mode\"]:checked")?.value || "default"

    resetRun()
    setStatus("queued", "Queued")
    setConnectionState("live")
    addLog("Initializing request...")

    try {
      const resp = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mode })
      })
      const payload = await resp.json()
      if (!resp.ok) {
        throw new Error(payload.error || "Failed to start")
      }
      
      // If server returns 'completed' state immediately (from cache)
      if (payload.status === 'completed' && payload.downloadUrl) {
          showDownloadLink(payload.downloadUrl)
          addLog("File found in cache. Download ready.")
          setStatus("completed", "Completed")
          return
      }

      appState.jobId = payload.jobId
      setActiveJobId(payload.jobId)
      addLog(`Job accepted: ${appState.jobId}`)
    } catch (err) {
      setStatus("failed", "Failed")
      const message = err instanceof Error ? err.message : String(err)
      addLog(message || "Failed to start job", true)
    }
  })
}

if (els.clearLogButton) {
  els.clearLogButton.addEventListener("click", () => {
    clearLogs()
  })
}

const stream = new EventSource("/api/stream")

stream.onopen = () => {
  setConnectionState("live")
}

stream.addEventListener("status", (event) => {
  const data = JSON.parse(event.data)
  if (data.output && els.outputPath) {
    els.outputPath.textContent = data.output
  }
  
  if (data.jobId && !appState.jobId && data.state === 'running') {
      appState.jobId = data.jobId
      setActiveJobId(data.jobId)
  }

  if (!isRelevantJob(data.jobId)) {
    return
  }

  // Handle Download URL
  if (data.downloadUrl) {
      showDownloadLink(data.downloadUrl)
  }

  switch (data.state) {
    case "running":
      appState.jobId = data.jobId
      setActiveJobId(data.jobId)
      setStatus("running", "Running")
      break
    case "completed":
      setStatus("completed", "Completed")
      addLog("Job cycle completed successfully.")
      if (data.message) addLog(data.message)
      break
    case "failed":
      setStatus("failed", "Failed")
      addLog("Job cycle failed.", true)
      break
    default:
      setStatus("idle", "Idle")
      break
  }
})

stream.addEventListener("log", (event) => {
  const data = JSON.parse(event.data)
  if (!isRelevantJob(data.jobId)) return
  addLog(data.message)
})

stream.addEventListener("log-error", (event) => {
  const data = JSON.parse(event.data)
  if (!isRelevantJob(data.jobId)) return
  addLog(data.message, true)
})

stream.addEventListener("progress-start", (event) => {
  const data = JSON.parse(event.data)
  if (!isRelevantJob(data.jobId)) return
  createProgressRow(data.id, data.label, data.total)
})

stream.addEventListener("progress-update", (event) => {
  const data = JSON.parse(event.data)
  if (!isRelevantJob(data.jobId)) return
  updateProgressRow(data.id, data.value, data.total)
})

stream.addEventListener("progress-stop", (event) => {
  const data = JSON.parse(event.data)
  if (!isRelevantJob(data.jobId)) return
  completeProgressRow(data.id)
})

stream.onerror = () => {
  setConnectionState("down")
  if (appState.running) {
    setStatus("disconnected", "Disconnected")
  }
}
