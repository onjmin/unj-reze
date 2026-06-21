import type { AssetManifest } from './game-config';

interface BgmHandle {
  stop: () => void;
}

class BgmManager {
  private current: BgmHandle | null = null;

  async play(manifest: AssetManifest) {
    this.stop();
    if (!manifest.bgm || !manifest.bgm.src) return;

    if (manifest.bgm.type === 'midi') {
      await this.playMidi(manifest.bgm.src);
    } else if (manifest.bgm.type === 'youtube') {
      this.playYoutube(manifest.bgm.src);
    } else if (manifest.bgm.type === 'mml') {
      this.playMml(manifest.bgm.src);
    } else if (manifest.bgm.type === 'direct') {
      this.playDirect(manifest.bgm.src);
    }
  }

  stop() {
    if (this.current) { try { this.current.stop(); } catch (e) { } this.current = null; }
    document.querySelectorAll('.bgm-youtube-container').forEach(el => el.remove());
  }

  // ── 直リンク音声（MP3/WAV）をループ再生 ──

  private playDirect(url: string) {
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.6;
    audio.play().catch(() => {});
    this.current = {
      stop: () => { try { audio.pause(); audio.src = ''; } catch (e) { } },
    };
  }

  destroy() {
    this.stop();
  }

  // ── MIDI ──

  private async playMidi(url: string) {
    const loadScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('load failed: ' + src));
        document.head.appendChild(s);
      });

    await loadScript('https://cdn.jsdelivr.net/npm/midi-player-js@2.0.16/browser/midiplayer.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/soundfont-player@0.12.0/dist/soundfont-player.min.js');

    const MP = (window as any).MidiPlayer;
    const SF = (window as any).Soundfont;
    if (!MP || !SF) return;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();

    const inst = await SF.instrument(ctx, 'lead_1_square', { soundfont: 'MusyngKite' });
    const res = await fetch(url);
    if (!res.ok) return;
    const ab = await res.arrayBuffer();

    const player = new MP.Player((evt: any) => {
      if (evt.name === 'Note on' && evt.velocity > 0) {
        inst.play(evt.noteName, ctx.currentTime, { gain: evt.velocity / 127 * 1.0, duration: 0.25 });
      }
    });
    player.on('endOfFile', () => { try { player.stop(); player.play(); } catch (e) { } });
    player.loadArrayBuffer(ab);
    player.play();

    this.current = {
      stop: () => { try { player.stop(); } catch (e) { } ctx.close(); },
    };
  }

  // ── MML ──

  private mmlTimer: ReturnType<typeof setTimeout> | null = null;
  private mmlCtx: AudioContext | null = null;

  private playMml(mml: string) {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    this.mmlCtx = ctx;

    const notes = mml.toUpperCase().match(/[A-G][#B]?[0-9]?/g) || [];
    const noteLen = 0.25;
    const getFreq = (n: string): number => {
      const base: Record<string, number> = { 'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13, 'E': 329.63, 'F': 349.23, 'F#': 369.99, 'G': 392.00, 'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88 };
      const key = n.length > 1 && (n[1] === '#' || n[1] === 'B') ? n.slice(0, 2) : n[0];
      return base[key] || 0;
    };

    let time = ctx.currentTime;
    for (const note of notes) {
      if (note.includes('R')) continue;
      const freq = getFreq(note);
      if (!freq) continue;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + noteLen - 0.05);
      osc.start(time);
      osc.stop(time + noteLen);
      time += noteLen;
    }

    const totalDuration = (time - ctx.currentTime) * 1000;
    this.mmlTimer = setTimeout(() => { this.playMml(mml); }, totalDuration);

    this.current = {
      stop: () => {
        if (this.mmlTimer) clearTimeout(this.mmlTimer);
        ctx.close();
      },
    };
  }

  // ── YouTube ──

  private extractVideoId(url: string): string | null {
    const m = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  private playYoutube(url: string) {
    const videoId = this.extractVideoId(url);
    if (!videoId) return;

    const existing = document.querySelector('.bgm-youtube-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.className = 'bgm-youtube-container';
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';

    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}`;
    iframe.width = '1';
    iframe.height = '1';
    iframe.allow = 'autoplay';
    container.appendChild(iframe);
    document.body.appendChild(container);

    this.current = {
      stop: () => { container.remove(); },
    };
  }
}

export const bgmManager = new BgmManager();
