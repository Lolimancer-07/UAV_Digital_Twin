/**
 * frontend/lib/telemetry/auth.ts
 *
 * Client-Side Authentication, Session Management, and Tenant Switching for UAV Digital Twin.
 * Implements improvement_plan.md §4 Phase 3:
 *   - Completely eliminates NEXT_PUBLIC_* secret tokens from client bundles.
 *   - Obtains and refreshes short-lived HMAC-signed JWT access tokens via REST /api/twin/auth/token.
 *   - Enforces aircraft-scoped tenant subscriptions (tenant_alpha vs tenant_bravo).
 *   - Tracks caller role (viewer, dispatcher, maintainer, admin) for UI command authorization.
 */

export type UserRole = "viewer" | "dispatcher" | "maintainer" | "admin"

export interface AuthSession {
  user_id: string
  tenant_id: string
  role: UserRole
  aircraft_ids: string[]
  token: string
  expires_in: number
  issued_at: number
}

export const TENANT_FLEET_MAPPING: Record<string, string[]> = {
  tenant_alpha: ["UAV-01", "UAV-02", "UAV-03"],
  tenant_bravo: ["UAV-04", "UAV-05"],
  default: ["UAV-01", "UAV-02", "UAV-03", "UAV-04", "UAV-05"],
}

export const DEFAULT_SESSION: AuthSession = {
  user_id: "demo-operator",
  tenant_id: "tenant_alpha",
  role: "dispatcher",
  aircraft_ids: ["UAV-01", "UAV-02", "UAV-03"],
  token: "",
  expires_in: 900,
  issued_at: 0,
}

let activeSession: AuthSession = { ...DEFAULT_SESSION }
const listeners: Array<(session: AuthSession) => void> = []

export function getActiveSession(): AuthSession {
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem("uav_twin_session")
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && parsed.tenant_id) {
          activeSession = parsed
        }
      }
    } catch {}
  }
  return activeSession
}

export function setActiveSession(session: AuthSession): void {
  activeSession = session
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("uav_twin_session", JSON.stringify(session))
    } catch {}
  }
  listeners.forEach((listener) => {
    try {
      listener(session)
    } catch (e) {
      console.error("[AUTH] Listener error:", e)
    }
  })
}

export function subscribeToSessionChanges(callback: (session: AuthSession) => void): () => void {
  listeners.push(callback)
  return () => {
    const idx = listeners.indexOf(callback)
    if (idx !== -1) {
      listeners.splice(idx, 1)
    }
  }
}

/**
 * Fetch a short-lived session token from the backend auth endpoint.
 */
export async function fetchSessionToken(options?: {
  user_id?: string
  tenant_id?: string
  role?: UserRole
  aircraft_ids?: string[]
}): Promise<AuthSession> {
  const current = getActiveSession()
  const targetTenant = options?.tenant_id || current.tenant_id || "tenant_alpha"
  const tenantChanged = options?.tenant_id != null && options.tenant_id !== current.tenant_id

  // If tenant changed or aircraft_ids not explicitly provided for this tenant, resolve from tenant fleet mapping
  const targetAircraft =
    options?.aircraft_ids ??
    (tenantChanged ? TENANT_FLEET_MAPPING[targetTenant] : current.aircraft_ids) ??
    TENANT_FLEET_MAPPING[targetTenant] ??
    ["*"]

  const payload = {
    user_id: options?.user_id || current.user_id || "demo-operator",
    tenant_id: targetTenant,
    role: options?.role || current.role || "dispatcher",
    aircraft_ids: targetAircraft,
    expires_in_seconds: 900,
  }

  try {
    const res = await fetch("/api/twin/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error(`Auth endpoint returned HTTP ${res.status}`)
    }

    const data = await res.json()
    const newSession: AuthSession = {
      user_id: data.user_id || payload.user_id,
      tenant_id: data.tenant_id || payload.tenant_id,
      role: (data.role as UserRole) || payload.role,
      aircraft_ids: data.aircraft_ids || payload.aircraft_ids,
      token: data.token || "",
      expires_in: data.expires_in || 900,
      issued_at: Date.now(),
    }

    setActiveSession(newSession)
    return newSession
  } catch (err) {
    console.warn("[AUTH] Failed to fetch token from backend, using local session:", err)
    return activeSession
  }
}
