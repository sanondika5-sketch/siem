import { NextResponse } from "next/server"
import { getDB, saveDB } from "@/lib/db"

export async function POST(request: Request) {
  try {
    const { action, alertId, status, noteText } = await request.json()

    if (!alertId || !action) {
      return NextResponse.json({ error: "Missing required 'alertId' or 'action' parameter." }, { status: 400 })
    }

    const db = await getDB()
    const alertIndex = db.alerts.findIndex((a) => a.id === alertId)

    if (alertIndex === -1) {
      return NextResponse.json({ error: "Alert not found." }, { status: 404 })
    }

    const alert = db.alerts[alertIndex]

    if (action === "status" && status) {
      alert.status = status
    } else if (action === "note" && noteText) {
      alert.notes.push({
        id: `note-${Date.now()}`,
        author: "You",
        timestamp: new Date().toISOString(),
        text: noteText,
      })
    } else {
      return NextResponse.json({ error: "Invalid action or missing parameters." }, { status: 400 })
    }

    db.alerts[alertIndex] = alert
    await saveDB(db)

    return NextResponse.json({ success: true, alert })
  } catch (error) {
    return NextResponse.json({ error: "Failed to update alert state" }, { status: 500 })
  }
}
