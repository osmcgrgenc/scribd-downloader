const $ = (selector) => document.querySelector(selector)

const els = {
  form: $("#download-form"),
  urlInput: $("#url-input"),
  statusText: $("#status-text"),
  outputPath: $("#output-path"),
  connectionState: $("#connection-state"),
  progressList: $("#progress-list"),
  logList: $("#log"),
  startButton: $("#start-button"),
  clearLogButton: $("#clear-log")
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
  if (!els.connectionState) {
    return
  }
  const label = state === "down" ? "Disconnected" : "Live"
  els.connectionState.textContent = label
  els.connectionState.dataset.connection = state
}

function setBusy(isBusy) {
  appState.running = isBusy
  els.startButton.disabled = isBusy
  els.startButton.textContent = isBusy ? "Downloading..." : "Start download"
}

function setStatus(state, label) {
  const text = label || statusLabels[state] || "Idle"
  els.statusText.textContent = text
  els.statusText.dataset.state = state
  setBusy(state === "running" || state === "queued")
}

function clearProgress() {
  progressMap.clear()
  els.progressList.innerHTML = ""
}

function clearLogs() {
  els.logList.innerHTML = ""
}

function resetRun() {
  appState.jobId = null
  clearProgress()
  clearLogs()
}

function formatTime(date) {
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

function addLog(message, isError = false) {
  const line = document.createElement("div")
  line.className = `log-line${isError ? " error" : ""}`
  line.textContent = `[${formatTime(new Date())}] ${message}`
  els.logList.appendChild(line)

  while (els.logList.children.length > maxLogLines) {
    els.logList.removeChild(els.logList.firstChild)
  }
  els.logList.scrollTop = els.logList.scrollHeight
}

function createProgressRow(id, label, total) {
  const row = document.createElement("div")
  row.className = "progress-row"
  row.dataset.progressId = id

  const title = document.createElement("div")
  title.className = "progress-label"
  title.textContent = label

  const bar = document.createElement("div")
  bar.className = "progress-bar"
  const barFill = document.createElement("span")
  bar.appendChild(barFill)

  const meta = document.createElement("div")
  meta.className = "progress-meta"
  const totalLabel = typeof total === "number" ? total : "?"
  meta.textContent = `0 / ${totalLabel}`

  row.appendChild(title)
  row.appendChild(bar)
  row.appendChild(meta)

  els.progressList.appendChild(row)
  progressMap.set(id, { barFill, meta, total, row })
}

function updateProgressRow(id, value, total) {
  const entry = progressMap.get(id)
  if (!entry) {
    return
  }
  const safeTotal = typeof total === "number" ? total : entry.total
  const safeValue = Math.max(0, Math.min(value, safeTotal || value))
  const percentage = safeTotal ? Math.round((safeValue / safeTotal) * 100) : 0
  entry.barFill.style.width = `${percentage}%`
  entry.meta.textContent = `${safeValue} / ${safeTotal || "?"}`
}

function completeProgressRow(id) {
  const entry = progressMap.get(id)
  if (!entry) {
    return
  }
  entry.barFill.style.width = "100%"
  entry.row.classList.add("done")
}

function isRelevantJob(jobId) {
  return !jobId || !appState.jobId || jobId === appState.jobId
}

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
  addLog("Sending request...")

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
    appState.jobId = payload.jobId
    addLog(`Job accepted: ${appState.jobId}`)
  } catch (err) {
    setStatus("failed", "Failed")
    const message = err instanceof Error ? err.message : String(err)
    addLog(message || "Failed to start job", true)
  }
})

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
  if (data.output) {
    els.outputPath.textContent = data.output
  }
  if (!isRelevantJob(data.jobId)) {
    return
  }

  switch (data.state) {
    case "running":
      appState.jobId = data.jobId
      setStatus("running", "Running")
      break
    case "completed":
      setStatus("completed", "Completed")
      addLog("Job completed.")
      break
    case "failed":
      setStatus("failed", "Failed")
      addLog("Job failed.", true)
      break
    default:
      setStatus("idle", "Idle")
      break
  }
})

stream.addEventListener("log", (event) => {
  const data = JSON.parse(event.data)
  if (!isRelevantJob(data.jobId)) {
    return
  }
  addLog(data.message)
})

stream.addEventListener("log-error", (event) => {
  const data = JSON.parse(event.data)
  if (!isRelevantJob(data.jobId)) {
    return
  }
  addLog(data.message, true)
})

stream.addEventListener("progress-start", (event) => {
  const data = JSON.parse(event.data)
  if (!isRelevantJob(data.jobId)) {
    return
  }
  createProgressRow(data.id, data.label, data.total)
})

stream.addEventListener("progress-update", (event) => {
  const data = JSON.parse(event.data)
  if (!isRelevantJob(data.jobId)) {
    return
  }
  updateProgressRow(data.id, data.value, data.total)
})

stream.addEventListener("progress-stop", (event) => {
  const data = JSON.parse(event.data)
  if (!isRelevantJob(data.jobId)) {
    return
  }
  completeProgressRow(data.id)
})

stream.onerror = () => {
  setConnectionState("down")
  if (appState.running) {
    setStatus("disconnected", "Disconnected")
  }
}
