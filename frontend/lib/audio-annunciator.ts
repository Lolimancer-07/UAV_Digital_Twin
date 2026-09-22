/**
 * frontend/lib/audio-annunciator.ts
 *
 * Lightweight Web Audio API synthesizer for aerospace avionics audio alerts:
 * - Master Caution: Two-tone descending chime (587 Hz -> 440 Hz) on anomaly/warning
 * - Master Warning: Pulsed warning klaxon (880 Hz triple-pulse) on critical failure
 * - Automatic throttling: 12-second cooldown prevents audio fatigue during 10 Hz telemetry streams
 * - Operator mute state with localStorage persistence (defaults to muted for quiet browsing)
 */

class AudioAnnunciator {
  private audioCtx: AudioContext | null = null
  private isMuted: boolean = true
  private lastAlertTime: number = 0
  private cooldownMs: number = 12000 // 12 seconds minimum between automatic alarms

  constructor() {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("gcs_avionics_audio_muted")
      // Default to muted to prevent unexpected noise on load
      this.isMuted = saved !== null ? saved === "true" : true
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === "undefined") return null
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass()
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {})
    }
    return this.audioCtx
  }

  public getMuted(): boolean {
    return this.isMuted
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted
    if (typeof window !== "undefined") {
      localStorage.setItem("gcs_avionics_audio_muted", String(muted))
    }
    if (!muted) {
      // Warm up audio context on explicit user unmute interaction
      this.initContext()
      // Play a quick, subtle confirmation click/pip
      this.playPip()
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted)
    return this.isMuted
  }

  /**
   * Play subtle test pip (confirmation sound)
   */
  public playPip(): void {
    const ctx = this.initContext()
    if (!ctx) return

    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(659.25, ctx.currentTime) // E5

      gain.gain.setValueAtTime(0.04, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.08)
    } catch {
      // Audio context may be restricted by browser policy
    }
  }

  /**
   * Master Caution: Avionics two-tone ping (D5 587 Hz -> A4 440 Hz)
   */
  public playCaution(force: boolean = false): void {
    if (this.isMuted) return
    const now = Date.now()
    if (!force && now - this.lastAlertTime < this.cooldownMs) return
    this.lastAlertTime = now

    const ctx = this.initContext()
    if (!ctx) return

    try {
      const nowTime = ctx.currentTime

      // Tone 1: 587 Hz (D5)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = "sine"
      osc1.frequency.setValueAtTime(587.33, nowTime)
      gain1.gain.setValueAtTime(0.12, nowTime)
      gain1.gain.exponentialRampToValueAtTime(0.001, nowTime + 0.22)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(nowTime)
      osc1.stop(nowTime + 0.22)

      // Tone 2: 440 Hz (A4)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = "sine"
      osc2.frequency.setValueAtTime(440.0, nowTime + 0.18)
      gain2.gain.setValueAtTime(0.12, nowTime + 0.18)
      gain2.gain.exponentialRampToValueAtTime(0.001, nowTime + 0.45)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(nowTime + 0.18)
      osc2.stop(nowTime + 0.45)
    } catch {
      // Audio context may be restricted
    }
  }

  /**
   * Master Warning: Pulsed aerospace alarm (880 Hz triple-pulse)
   */
  public playWarning(force: boolean = false): void {
    if (this.isMuted) return
    const now = Date.now()
    if (!force && now - this.lastAlertTime < this.cooldownMs) return
    this.lastAlertTime = now

    const ctx = this.initContext()
    if (!ctx) return

    try {
      const nowTime = ctx.currentTime
      const pulses = [0, 0.15, 0.3]

      pulses.forEach((offset) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = "triangle"
        osc.frequency.setValueAtTime(880.0, nowTime + offset)
        gain.gain.setValueAtTime(0.15, nowTime + offset)
        gain.gain.exponentialRampToValueAtTime(0.001, nowTime + offset + 0.1)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(nowTime + offset)
        osc.stop(nowTime + offset + 0.1)
      })
    } catch {
      // Audio context restricted
    }
  }
}

export const audioAnnunciator = new AudioAnnunciator()
