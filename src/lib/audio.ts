import * as Tone from 'tone';
export type Mix = { stage: 1 | 2; intro: number; proximity: number; filterOpen: number; speed: number };
/** Seven stems play continuously on one phase-aligned timeline; stage changes only move gains (no restarts). Limiter added so three Stage 3 stems cannot clip. */
export class CollectiveAudio {
  private players: Tone.Player[] = []; private gains: Tone.Gain[] = [];
  private stringsPlayer: Tone.Player | null = null; private stringsGain: Tone.Gain | null = null;
  private master: Tone.Gain | null = null; private limiter: Tone.Limiter | null = null; private lowpass: Tone.Filter | null = null;
  private layer = 0; private mix: Mix = { stage: 1, intro: 0.6, proximity: 0, filterOpen: 0, speed: 0 };
  private prepared = false; private playing = false;
  /** MUST be the first call in a tap handler (no await before it) for iOS Safari. */
  unlock(): Promise<void> { return Tone.start(); }
  get state(): string { return this.limiter || this.master ? String(Tone.getContext().state) : 'idle'; }
  get isPlaying() { return this.playing; }
  async prepare(layer: number): Promise<void> {
    this.dispose(); this.layer = layer;
    this.limiter = new Tone.Limiter(-1).toDestination();
    this.master = new Tone.Gain(0.85).connect(this.limiter);
    this.lowpass = new Tone.Filter({ type: 'lowpass', frequency: 180, rolloff: -24, Q: 0.7 }).connect(this.master);
    for (let i = 0; i < 2; i++) for (let s = 1; s <= 3; s++) {
      const g = new Tone.Gain(0).connect(this.lowpass);
      this.players.push(new Tone.Player({ url: `/audio/layer${i + 1}_stage${s}.m4a`, loop: true, fadeIn: 0.03, fadeOut: 0.03 }).connect(g));
      this.gains.push(g);
    }
    this.stringsGain = new Tone.Gain(0).connect(this.lowpass);
    this.stringsPlayer = new Tone.Player({ url: '/audio/strings_stage3.m4a', loop: true, fadeIn: 0.03, fadeOut: 0.03 }).connect(this.stringsGain);
    await Tone.loaded();
    this.prepared = true;
  }
  play(anchorMs: number | null, serverOffsetMs: number) {
    if (!this.prepared || this.playing) return;
    const loop = this.players[0]?.buffer.duration || 27.428;
    const phase = anchorMs === null ? 0 : Math.max(0, (Date.now() + serverOffsetMs + 180 - anchorMs) / 1000) % loop;
    const t = Tone.now() + 0.18;
    this.players.forEach(p => p.start(t, phase)); this.stringsPlayer?.start(t, phase);
    this.playing = true; this.apply();
  }
  async resume() { try { await Tone.start(); const ctx = Tone.getContext().rawContext as AudioContext; if (ctx.state !== 'running') await ctx.resume(); } catch { /* needs a tap */ } }
  setMix(m: Partial<Mix>) { this.mix = { ...this.mix, ...m }; this.apply(); }
  private apply() {
    if (!this.playing) return;
    const together = Math.max(0, Math.min(1, this.mix.proximity));
    this.gains.forEach((g, i) => {
      const owner = Math.floor(i / 3), stage = (i % 3) + 1; const local = owner === this.layer;
      const target = stage === 3 ? together * 0.85 : local && stage === this.mix.stage ? (1 - together) * 0.85 * this.mix.intro : 0;
      g.gain.rampTo(target, 1.0);
    });
    this.stringsGain?.gain.rampTo(together * 0.85, 1.0);
    const t = Math.min(1, Math.max(0, this.mix.speed) / 2);
    const hz = 180 * Math.pow(14000 / 180, 0.2 + 0.8 * t);
    const open = Math.max(0, Math.min(1, this.mix.filterOpen));
    this.lowpass?.frequency.rampTo(hz * Math.pow(14000 / hz, open), 0.6);
  }
  fadeOut(seconds: number) { this.master?.gain.rampTo(0, seconds); }
  dispose() {
    this.playing = false; this.prepared = false;
    const all = [...this.players, ...(this.stringsPlayer ? [this.stringsPlayer] : [])];
    all.forEach(p => { try { p.stop(); } catch { /* not started */ } p.dispose(); });
    [...this.gains, ...(this.stringsGain ? [this.stringsGain] : []), ...(this.lowpass ? [this.lowpass] : []), ...(this.master ? [this.master] : []), ...(this.limiter ? [this.limiter] : [])].forEach(n => n.dispose());
    this.players = []; this.gains = []; this.stringsPlayer = null; this.stringsGain = null; this.lowpass = null; this.master = null; this.limiter = null;
  }
}
