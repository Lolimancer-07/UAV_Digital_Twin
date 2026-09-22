/**
 * frontend/lib/audio-annunciator.ts
 *
 * High-fidelity Web Audio API annunciator synthesizer for aerospace UAV avionics alerts:
 * - Continuous Master Warning: Urgent aerospace klaxon (920 Hz + 1840 Hz harmonic triple-pulse) looping continuously
 * - Continuous Master Caution: Avionics chime (587 Hz D5 -> 440 Hz A4) looping continuously
 * - High-Intensity Audio Engine: Dynamics compressor + master gain for powerful, distortion-free sound presence
 * - Speech Synthesis: Clear vocal callout for each active fault/alarm by name ("Warning: Cooling Degradation")
 * - Operator Controls: Volume slider, intensity boost, temporary alarm silence/acknowledgment, and mute toggle
 */

export type AlarmSeverity = "CRITICAL" | "WARNING" | null
export type AlarmIntensityLevel = "normal" | "high" | "max"

export interface ActiveAlarmState {
  severity: AlarmSeverity
  faults: Array<{ name?: string; severity?: string }>
  isSilenced: boolean
  isPaused: boolean
  isSounding: boolean
  isMuted: boolean
  volume: number
  intensity: number
}

class AudioAnnunciator {
  private audioCtx: AudioContext | null = null
  private compressorNode: DynamicsCompressorNode | null = null
  private masterGainNode: GainNode | null = null

  private isMuted: boolean = false
  private isSimulationPaused: boolean = false
  private volume: number = 1.0 // 0.0 to 1.0
  private intensityMultiplier: number = 1.35 // Boosted sound intensity

  // Continuous alarm state
  private continuousTimer: ReturnType<typeof setInterval> | null = null
  private activeSeverity: AlarmSeverity = null
  private activeFaults: Array<{ name?: string; severity?: string }> = []
  private isSilenced: boolean = false
  private isTesting: boolean = false
  private testTimer: ReturnType<typeof setTimeout> | null = null

  // Vocal callout tracking
  private announcedFaults: Set<string> = new Set()
  private lastVocalTime: number = 0

  // Observers for React UI reactive updates
  private listeners: Set<() => void> = new Set()

  constructor() {
    if (typeof window !== "undefined") {
      const savedMute = localStorage.getItem("gcs_avionics_audio_muted")
      // Default to unmuted (false) if not explicitly set, so alarms are heard immediately
      this.isMuted = savedMute !== null ? savedMute === "true" : false

      const savedVol = localStorage.getItem("gcs_avionics_audio_volume")
      if (savedVol !== null) {
        const parsed = parseFloat(savedVol)
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          this.volume = parsed
        }
      }

      const savedInt = localStorage.getItem("gcs_avionics_audio_intensity")
      if (savedInt !== null) {
        const parsed = parseFloat(savedInt)
        if (!isNaN(parsed) && parsed >= 1.0 && parsed <= 2.0) {
          this.intensityMultiplier = parsed
        }
      }

      // Auto-unlock Web Audio on first user gesture anywhere on window
      const unlock = () => {
        this.initContext()
        if (this.audioCtx && this.audioCtx.state === "suspended") {
          this.audioCtx.resume().catch(() => {})
        }
        window.removeEventListener("pointerdown", unlock)
        window.removeEventListener("keydown", unlock)
        window.removeEventListener("click", unlock)
      }
      window.addEventListener("pointerdown", unlock, { passive: true })
      window.addEventListener("keydown", unlock, { passive: true })
      window.addEventListener("click", unlock, { passive: true })
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === "undefined") return null
    if (!this.audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass()

        // High-presence aerospace dynamics compressor to prevent clipping while boosting perceived loudness
        this.compressorNode = this.audioCtx.createDynamicsCompressor()
        this.compressorNode.threshold.setValueAtTime(-14, this.audioCtx.currentTime)
        this.compressorNode.knee.setValueAtTime(8, this.audioCtx.currentTime)
        this.compressorNode.ratio.setValueAtTime(7, this.audioCtx.currentTime)
        this.compressorNode.attack.setValueAtTime(0.003, this.audioCtx.currentTime)
        this.compressorNode.release.setValueAtTime(0.12, this.audioCtx.currentTime)

        // Master gain node
        this.masterGainNode = this.audioCtx.createGain()
        this.updateMasterGain()

        this.masterGainNode.connect(this.compressorNode)
        this.compressorNode.connect(this.audioCtx.destination)
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {})
    }
    return this.audioCtx
  }

  private updateMasterGain(): void {
    if (!this.masterGainNode || !this.audioCtx) return
    const effectiveGain = this.isMuted
      ? 0
      : Math.min(1.0, this.volume * this.intensityMultiplier * 0.9)
    this.masterGainNode.gain.setValueAtTime(effectiveGain, this.audioCtx.currentTime)
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb()
      } catch {}
    })
  }

  public getState(): ActiveAlarmState {
    return {
      severity: this.activeSeverity,
      faults: this.activeFaults,
      isSilenced: this.isSilenced,
      isPaused: this.isSimulationPaused,
      isSounding:
        !this.isMuted &&
        !this.isSilenced &&
        !this.isSimulationPaused &&
        (this.activeSeverity !== null || this.isTesting),
      isMuted: this.isMuted,
      volume: this.volume,
      intensity: this.intensityMultiplier,
    }
  }

  public isPaused(): boolean {
    return this.isSimulationPaused
  }

  /**
   * Pause or resume the sound when the pause button is clicked
   */
  public setPaused(paused: boolean): void {
    if (this.isSimulationPaused === paused) return
    this.isSimulationPaused = paused

    if (paused) {
      // Pause alarm sound immediately
      this.stopLoop()
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    } else {
      // Resume alarm sound if an alarm is active, unmuted, and not silenced
      if (this.activeSeverity && !this.isMuted && !this.isSilenced) {
        this.startLoop(this.activeSeverity)
      }
    }
    this.notify()
  }

  public getMuted(): boolean {
    return this.isMuted
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted
    if (typeof window !== "undefined") {
      localStorage.setItem("gcs_avionics_audio_muted", String(muted))
    }
    this.updateMasterGain()
    if (!muted) {
      this.initContext()
      this.playPip()
      // If an alarm is currently active, immediately resume continuous loop
      if (this.activeSeverity && !this.isSilenced) {
        this.startLoop(this.activeSeverity)
      }
    } else {
      this.stopLoop()
    }
    this.notify()
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted)
    return this.isMuted
  }

  public getVolume(): number {
    return this.volume
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol))
    if (typeof window !== "undefined") {
      localStorage.setItem("gcs_avionics_audio_volume", String(this.volume))
    }
    this.updateMasterGain()
    this.notify()
  }

  public getIntensity(): number {
    return this.intensityMultiplier
  }

  public setIntensity(multiplier: number): void {
    this.intensityMultiplier = Math.max(1.0, Math.min(2.0, multiplier))
    if (typeof window !== "undefined") {
      localStorage.setItem("gcs_avionics_audio_intensity", String(this.intensityMultiplier))
    }
    this.updateMasterGain()
    this.notify()
  }

  public silenceAlarm(): void {
    this.isSilenced = true
    this.stopLoop()
    this.notify()
  }

  public unsilenceAlarm(): void {
    this.isSilenced = false
    if (this.activeSeverity && !this.isMuted) {
      this.startLoop(this.activeSeverity)
    }
    this.notify()
  }

  /**
   * Continuous synchronization with incoming telemetry packets
   */
  public updateAlarms(
    faultEvents: Array<{ name?: string; severity?: string }> = [],
    alertLevel: string = "NOMINAL",
    isAnomaly: boolean = false
  ): void {
    if (this.isTesting) return

    this.activeFaults = faultEvents

    // Determine target severity
    const hasCritical =
      alertLevel === "CRITICAL" ||
      faultEvents.some((f) => String(f.severity).toUpperCase() === "CRITICAL")

    const hasWarning =
      alertLevel === "WARNING" ||
      isAnomaly ||
      faultEvents.some((f) => String(f.severity).toUpperCase() === "WARNING")

    const targetSeverity: AlarmSeverity = hasCritical
      ? "CRITICAL"
      : hasWarning
      ? "WARNING"
      : null

    // Check for newly triggered faults for voice annunciations
    const currentFaultNames = new Set(faultEvents.map((f) => f.name || "ANOMALY"))
    let hasNewFault = false

    currentFaultNames.forEach((name) => {
      if (!this.announcedFaults.has(name)) {
        hasNewFault = true
        this.announcedFaults.add(name)
        // Vocal callout for each newly triggered alarm
        const fault = faultEvents.find((f) => (f.name || "ANOMALY") === name)
        const sev = fault?.severity || (hasCritical ? "CRITICAL" : "WARNING")
        this.vocalizeAlarm(name, sev)
      }
    })

    // Remove cleared faults from the announced set
    for (const name of Array.from(this.announcedFaults)) {
      if (!currentFaultNames.has(name)) {
        this.announcedFaults.delete(name)
      }
    }

    // If new critical fault escalated, break silence
    if (hasCritical && this.activeSeverity !== "CRITICAL" && this.isSilenced) {
      this.isSilenced = false
    }

    // When all alarms return to nominal
    if (!targetSeverity) {
      if (this.activeSeverity !== null) {
        this.activeSeverity = null
        this.isSilenced = false
        this.stopLoop()
        this.announcedFaults.clear()
        this.notify()
      }
      return
    }

    // Severity changed or continuous loop not yet started
    const severityChanged = targetSeverity !== this.activeSeverity
    this.activeSeverity = targetSeverity

    if (this.isSimulationPaused) {
      this.stopLoop()
      return
    }

    if ((severityChanged || !this.continuousTimer) && !this.isSilenced && !this.isMuted) {
      this.startLoop(targetSeverity)
    }

    if (severityChanged) {
      this.notify()
    }
  }

  /**
   * Vocal speech synthesis callout for each specific alarm
   */
  private vocalizeAlarm(name: string, severity: string): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    if (this.isMuted || this.isSimulationPaused) return

    const now = Date.now()
    if (now - this.lastVocalTime < 2500) return // Brief delay to prevent overlap
    this.lastVocalTime = now

    try {
      const cleanName = name.replace(/_/g, " ").toLowerCase()
      const calloutText = `${severity.toLowerCase()}, ${cleanName}`
      const utterance = new SpeechSynthesisUtterance(calloutText)
      utterance.rate = 1.15
      utterance.pitch = severity.toUpperCase() === "CRITICAL" ? 1.2 : 1.05
      utterance.volume = Math.min(1.0, this.volume * 0.95)
      window.speechSynthesis.speak(utterance)
    } catch {
      // Speech synthesis blocked or unavailable
    }
  }

  /**
   * Start the continuous alarm loop for the given severity
   */
  private startLoop(severity: "CRITICAL" | "WARNING"): void {
    this.stopLoop()
    if (this.isSimulationPaused) return
    const ctx = this.initContext()
    if (!ctx) return

    if (severity === "CRITICAL") {
      // Continuous Master Warning Klaxon: 650ms cycle
      this.renderMasterWarningPulse()
      this.continuousTimer = setInterval(() => {
        if (!this.isMuted && !this.isSilenced && !this.isSimulationPaused) {
          this.renderMasterWarningPulse()
        }
      }, 650)
    } else {
      // Continuous Master Caution Chime: 1500ms cycle
      this.renderMasterCautionChime()
      this.continuousTimer = setInterval(() => {
        if (!this.isMuted && !this.isSilenced && !this.isSimulationPaused) {
          this.renderMasterCautionChime()
        }
      }, 1500)
    }
  }

  private stopLoop(): void {
    if (this.continuousTimer) {
      clearInterval(this.continuousTimer)
      this.continuousTimer = null
    }
  }

  /**
   * High-Intensity Master Warning: Dual-tone urgent pulsed klaxon (920 Hz & 1840 Hz harmonic)
   */
  private renderMasterWarningPulse(): void {
    const ctx = this.initContext()
    if (!ctx || !this.masterGainNode || this.isSimulationPaused || this.isMuted || this.isSilenced) return

    try {
      const nowTime = ctx.currentTime
      // 3 rapid, powerful bursts in the cycle
      const pulseOffsets = [0, 0.16, 0.32]

      pulseOffsets.forEach((offset) => {
        // Fundamental oscillator (sawtooth/triangle for cutting cockpit presence)
        const osc1 = ctx.createOscillator()
        const gain1 = ctx.createGain()
        osc1.type = "sawtooth"
        osc1.frequency.setValueAtTime(920.0, nowTime + offset)

        // Peak sound intensity: 0.65 base gain
        gain1.gain.setValueAtTime(0.65, nowTime + offset)
        gain1.gain.exponentialRampToValueAtTime(0.005, nowTime + offset + 0.13)

        // Lowpass filter to shape harmonics
        const filter = ctx.createBiquadFilter()
        filter.type = "lowpass"
        filter.frequency.setValueAtTime(2600, nowTime + offset)

        osc1.connect(filter)
        filter.connect(gain1)
        gain1.connect(this.masterGainNode!)

        osc1.start(nowTime + offset)
        osc1.stop(nowTime + offset + 0.13)

        // Harmonic overtone oscillator (sine at 1840 Hz for acoustic brilliance)
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = "sine"
        osc2.frequency.setValueAtTime(1840.0, nowTime + offset)
        gain2.gain.setValueAtTime(0.35, nowTime + offset)
        gain2.gain.exponentialRampToValueAtTime(0.005, nowTime + offset + 0.13)

        osc2.connect(gain2)
        gain2.connect(this.masterGainNode!)

        osc2.start(nowTime + offset)
        osc2.stop(nowTime + offset + 0.13)
      })
    } catch {}
  }

  /**
   * High-Intensity Master Caution: Aerospace two-tone descending chime (587 Hz D5 -> 440 Hz A4)
   */
  private renderMasterCautionChime(): void {
    const ctx = this.initContext()
    if (!ctx || !this.masterGainNode || this.isSimulationPaused || this.isMuted || this.isSilenced) return

    try {
      const nowTime = ctx.currentTime

      // Tone 1: 587.33 Hz (D5) - bright fundamental + second harmonic
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = "sine"
      osc1.frequency.setValueAtTime(587.33, nowTime)
      gain1.gain.setValueAtTime(0.55, nowTime)
      gain1.gain.exponentialRampToValueAtTime(0.002, nowTime + 0.28)
      osc1.connect(gain1)
      gain1.connect(this.masterGainNode!)
      osc1.start(nowTime)
      osc1.stop(nowTime + 0.28)

      // Tone 2: 440.00 Hz (A4) - rich descending bell
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = "sine"
      osc2.frequency.setValueAtTime(440.0, nowTime + 0.22)
      gain2.gain.setValueAtTime(0.55, nowTime + 0.22)
      gain2.gain.exponentialRampToValueAtTime(0.002, nowTime + 0.65)
      osc2.connect(gain2)
      gain2.connect(this.masterGainNode!)
      osc2.start(nowTime + 0.22)
      osc2.stop(nowTime + 0.65)
    } catch {}
  }

  /**
   * Test tone pip for confirmation
   */
  public playPip(): void {
    const ctx = this.initContext()
    if (!ctx || !this.masterGainNode) return

    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(740.0, ctx.currentTime) // F#5
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)

      osc.connect(gain)
      gain.connect(this.masterGainNode)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.1)
    } catch {}
  }

  /**
   * One-shot Caution for backward-compatibility
   */
  public playCaution(): void {
    if (this.isMuted) return
    this.renderMasterCautionChime()
  }

  /**
   * One-shot Warning for backward-compatibility
   */
  public playWarning(): void {
    if (this.isMuted) return
    this.renderMasterWarningPulse()
  }

  /**
   * Interactive test function allowing operator to test continuous alarm sound & intensity
   */
  public testAlarm(severity: "CRITICAL" | "WARNING" = "CRITICAL", durationSeconds: number = 4): void {
    if (this.testTimer) {
      clearTimeout(this.testTimer)
      this.testTimer = null
    }
    this.isTesting = true
    this.initContext()

    // Temporary un-silence/un-mute for the test
    const prevMute = this.isMuted
    if (this.isMuted) {
      this.isMuted = false
      this.updateMasterGain()
    }

    this.startLoop(severity)
    this.vocalizeAlarm(severity === "CRITICAL" ? "ENGINE OVERHEAT TEST" : "COOLING CAUTION TEST", severity)
    this.notify()

    this.testTimer = setTimeout(() => {
      this.stopTest(prevMute)
    }, durationSeconds * 1000)
  }

  public stopTest(restoreMute?: boolean): void {
    if (this.testTimer) {
      clearTimeout(this.testTimer)
      this.testTimer = null
    }
    this.isTesting = false
    if (restoreMute !== undefined) {
      this.isMuted = restoreMute
      this.updateMasterGain()
    }
    this.stopLoop()

    // Resume genuine active telemetry alarms if any
    if (this.activeSeverity && !this.isSilenced && !this.isMuted) {
      this.startLoop(this.activeSeverity)
    }
    this.notify()
  }
}

export const audioAnnunciator = new AudioAnnunciator()
