"use client"

import { createContext, useCallback, useContext, useMemo, useState, useEffect, type ReactNode } from "react"
import { MOCK_ALERTS, MOCK_EVENTS, generateSingleEvent } from "@/lib/mock-data"
import type { Alert, AlertStatus, SecurityEvent } from "@/lib/types"

interface SiemContextValue {
  events: SecurityEvent[]
  alerts: Alert[]
  setAlertStatus: (id: string, status: AlertStatus) => void
  addNote: (id: string, text: string) => void
  getEventById: (id: string) => SecurityEvent | undefined
}

const SiemContext = createContext<SiemContextValue | null>(null)

export function SiemProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  // Events and alerts are synced with the database
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  // 1. Poll the database API every 5 seconds to get latest live data
  useEffect(() => {
    if (!mounted) return

    const syncWithDatabase = async () => {
      try {
        const res = await fetch("/api/events")
        if (res.ok) {
          const data = await res.json()
          setEvents(data.events || [])
          setAlerts(data.alerts || [])
        }
      } catch (error) {
        console.error("Failed to sync SIEM data with database:", error)
      }
    }

    // Initial sync
    syncWithDatabase()

    const interval = setInterval(syncWithDatabase, 5000)
    return () => clearInterval(interval)
  }, [mounted])

  // 2. Simulated log injector: pushes mock logs to the server to simulate activity
  useEffect(() => {
    if (!mounted) return

    let tick = 0
    const interval = setInterval(() => {
      const mockEvent = generateSingleEvent(tick++)
      
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockEvent),
      }).catch((err) => console.error("Simulated injector push failed:", err))
    }, 15000) // Inject a simulated event every 15 seconds

    return () => clearInterval(interval)
  }, [mounted])

  // 3. Update alert status on client and save to database
  const setAlertStatus = useCallback((id: string, status: AlertStatus) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))

    fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", alertId: id, status }),
    }).catch((err) => console.error("Failed to save alert status update:", err))
  }, [])

  // 4. Add notes on client and save to database
  const addNote = useCallback((id: string, text: string) => {
    const noteId = `note-${Date.now()}`
    const timestamp = new Date().toISOString()

    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              notes: [...a.notes, { id: noteId, author: "You", timestamp, text }],
            }
          : a,
      ),
    )

    fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "note", alertId: id, noteText: text }),
    }).catch((err) => console.error("Failed to save alert note:", err))
  }, [])

  const eventMap = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])
  const getEventById = useCallback((id: string) => eventMap.get(id), [eventMap])

  const value = useMemo(
    () => ({ events, alerts, setAlertStatus, addNote, getEventById }),
    [events, alerts, setAlertStatus, addNote, getEventById],
  )

  if (!mounted) {
    return <div className="min-h-screen bg-background" />
  }

  return <SiemContext.Provider value={value}>{children}</SiemContext.Provider>
}

export function useSiem() {
  const ctx = useContext(SiemContext)
  if (!ctx) throw new Error("useSiem must be used within a SiemProvider")
  return ctx
}
