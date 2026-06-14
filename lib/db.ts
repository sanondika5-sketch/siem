import fs from "fs"
import path from "path"
import type { Alert, SecurityEvent } from "./types"
import { MOCK_ALERTS, MOCK_EVENTS, generateRandomAlert } from "./mock-data"

const LOCAL_STORE_PATH = path.join(process.cwd(), "data-store.json")

interface DBData {
  events: SecurityEvent[]
  alerts: Alert[]
}

// Helper for Vercel KV Redis REST calls
async function kvFetch(command: string, ...args: any[]) {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return null

  try {
    const res = await fetch(`${url}/${command}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    })
    const data = await res.json()
    return data.result
  } catch (e) {
    console.error("Vercel KV Connection Error:", e)
    return null
  }
}

export async function getDB(): Promise<DBData> {
  // 1. Try Vercel KV first
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const data = await kvFetch("GET", "siem_data")
    if (data) {
      try {
        return JSON.parse(data)
      } catch (_) {}
    }
  }

  // 2. Fall back to local file system store
  if (fs.existsSync(LOCAL_STORE_PATH)) {
    try {
      const fileContent = fs.readFileSync(LOCAL_STORE_PATH, "utf-8")
      return JSON.parse(fileContent)
    } catch (_) {}
  }

  // 3. Default to initial mock data and write to local store
  const defaultData: DBData = {
    events: MOCK_EVENTS,
    alerts: MOCK_ALERTS,
  }
  await saveDB(defaultData)
  return defaultData
}

export async function saveDB(data: DBData): Promise<void> {
  // 1. Try Vercel KV first
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    await kvFetch("SET", "siem_data", JSON.stringify(data))
    return
  }

  // 2. Fall back to local file system store
  try {
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(data, null, 2), "utf-8")
  } catch (err) {
    console.error("Failed to write local database file:", err)
  }
}

/** Processes a new external raw event, runs threat classification, and inserts it. */
export async function ingestEvent(payload: Partial<SecurityEvent>): Promise<SecurityEvent> {
  const db = await getDB()

  const timestamp = payload.timestamp || new Date().toISOString()
  const severity = payload.severity || "info"
  const category = payload.category || "Network"
  const source = payload.source || "external-collector"
  const sourceIp = payload.sourceIp || "0.0.0.0"
  const user = payload.user || "system"
  const message = payload.message || "Generic security telemetry captured."
  
  const newEvent: SecurityEvent = {
    id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp,
    severity,
    category,
    source,
    sourceIp,
    user,
    message,
    raw: payload.raw || `${timestamp} ${source} ${category.toLowerCase()}: ${message} src_ip=${sourceIp} user=${user}`,
  }

  // Add new event at the beginning of the array
  db.events.unshift(newEvent)

  // Keep a cap of max 1000 events to prevent DB bloat
  if (db.events.length > 1000) {
    db.events = db.events.slice(0, 1000)
  }

  // Trigger high/critical alerts automatically for malicious events
  if (severity === "critical" || severity === "high") {
    // Correlate with last few events
    const related = db.events.slice(0, 3)
    const newAlert = generateRandomAlert(related)
    // Make sure alert attributes match this event's properties
    newAlert.severity = severity
    newAlert.title = `${category} alert: ${message}`
    newAlert.sourceIp = sourceIp
    
    db.alerts.unshift(newAlert)
  }

  await saveDB(db)
  return newEvent
}
