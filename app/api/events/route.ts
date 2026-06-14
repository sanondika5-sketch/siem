import { NextResponse } from "next/server"
import { getDB, ingestEvent } from "@/lib/db"

export async function GET() {
  try {
    const data = await getDB()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: "Failed to read security events database" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Basic Validation
    if (!body.message) {
      return NextResponse.json({ error: "Missing required 'message' field in event payload" }, { status: 400 })
    }

    const createdEvent = await ingestEvent(body)
    return NextResponse.json({ success: true, event: createdEvent })
  } catch (error) {
    return NextResponse.json({ error: "Failed to ingest event payload" }, { status: 500 })
  }
}
