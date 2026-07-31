import type { AssetManifest, BgmAsset } from './game-config';
import { applyMasterVolume, subscribeMasterVolume } from './master-volume';
import type { LoopConfig as DtmLoopConfig, LoopPoint as DtmLoopPoint } from '@onjmin/dtm';

type LoopPointInput = { bar?: number; step?: number; seconds?: number };

/** BgmAsset['loop'] は全項目optionalな緩い形。dtm側は「1キーのみ持つ判別union」なので変換する。 */
function toDtmLoopPoint(p?: LoopPointInput): DtmLoopPoint | undefined {
  if (!p) return undefined;
  if (p.bar !== undefined) return { bar: p.bar };
  if (p.step !== undefined) return { step: p.step };
  if (p.seconds !== undefined) return { seconds: p.seconds };
  return undefined;
}

function toDtmLoopConfig(loop: BgmAsset['loop']): boolean | DtmLoopConfig | undefined {
  if (typeof loop === 'boolean' || loop === undefined) return loop;
  const start = toDtmLoopPoint(loop.start);
  const end = toDtmLoopPoint(loop.end);
  return start || end ? { start, end } : undefined;
}

interface BgmHandle {
  stop: () => void;
  /** マスター音量変更時に即時反映するための再設定（対応できない再生方式は省略可）。 */
  setBaseVolume?: (baseVolume: number) => void;
  seek?: (seconds: number) => void;
}

// ── 動的スクリプトタグで読み込む外部SDKの最小限のアンビエント型 ──

interface YtPlayerTarget {
  setVolume(v: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
}
interface YtPlayerInstance {
  destroy(): void;
  setVolume(v: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
}
interface YtPlayerCtor {
  new (elementId: string, options: {
    height: string | number;
    width: string | number;
    videoId: string;
    playerVars?: Record<string, unknown>;
    events?: {
      onReady?: (event: { target: YtPlayerTarget }) => void;
      onStateChange?: (event: { data: number; target: YtPlayerTarget }) => void;
    };
  }): YtPlayerInstance;
}

interface ScWidgetInstance {
  bind(event: string, cb: () => void): void;
  play(): void;
  pause(): void;
  setVolume(v: number): void;
}
interface ScWidgetCtor {
  (iframe: HTMLIFrameElement): ScWidgetInstance;
  Events: { READY: string; FINISH: string };
}

interface MidiPlayerEvent {
  name: string;
  velocity: number;
  noteName: string;
}
interface MidiPlayerInstance {
  on(event: string, cb: () => void): void;
  loadArrayBuffer(buf: ArrayBuffer): void;
  play(): void;
  stop(): void;
}
interface SoundfontInstrument {
  play(note: string, when: number, opts: { gain: number; duration: number }): void;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    onYouTubeIframeAPIReady?: () => void;
    YT?: {
      Player: YtPlayerCtor;
      PlayerState: { ENDED: number };
    };
    SC?: {
      Widget: ScWidgetCtor;
    };
    MidiPlayer?: {
      Player: new (cb: (evt: MidiPlayerEvent) => void) => MidiPlayerInstance;
    };
    Soundfont?: {
      instrument(ctx: AudioContext, name: string, opts: { soundfont: string }): Promise<SoundfontInstrument>;
    };
  }
}

class BgmManager {
  private current: BgmHandle | null = null;
  private currentKey: { type: string; src: string } | null = null;
  private baseVolume = 50;

  constructor() {
    subscribeMasterVolume(() => this.current?.setBaseVolume?.(this.baseVolume));
  }

  async play(manifest: AssetManifest) {
    if (!manifest.bgm || !manifest.bgm.src) {
      this.stop();
      return;
    }

    const type = manifest.bgm.type ?? 'youtube';
    const src = manifest.bgm.src;
    const volume = manifest.bgm.volume !== undefined ? manifest.bgm.volume : 50;
    const start = manifest.bgm.start !== undefined ? manifest.bgm.start : 0;

    // シーン切替等で同じBGM（type, srcが同一）が指定された場合は巻き戻さず継続再生する
    if (this.currentKey && this.currentKey.type === type && this.currentKey.src === src && this.current) {
      this.baseVolume = volume;
      this.current.setBaseVolume?.(volume);
      if (start > 0) {
        this.current.seek?.(start);
      }
      return;
    }

    this.stop();
    this.currentKey = { type, src };
    this.baseVolume = volume;

    if (type === 'midi') {
      await this.playMidi(src, volume);
    } else if (type === 'youtube') {
      this.playYoutube(src, volume, start);
    } else if (type === 'nicovideo') {
      this.playNicovideo(src, volume);
    } else if (type === 'soundcloud') {
      this.playSoundCloud(src, volume);
    } else if (type === 'mml') {
      this.playMml(src, manifest.bgm.loop, volume);
    } else if (type === 'direct') {
      this.playDirect(src, volume, start);
    }
  }

  stop() {
    this.currentKey = null;
    if (this.current) { try { this.current.stop(); } catch { } this.current = null; }
    document.querySelectorAll('.bgm-youtube-container, .bgm-nicovideo-container, .bgm-soundcloud-container').forEach(el => el.remove());
  }

  seek(seconds: number) {
    this.current?.seek?.(seconds);
  }

  setRate(_rate: number) {
    // rate support
  }

  // ── 直リンク音声（MP3/WAV）をループ再生 ──

  private playDirect(url: string, volume: number = 50, startSeconds: number = 0) {
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = (applyMasterVolume(volume) / 100) * 0.6;
    if (startSeconds > 0) {
      audio.currentTime = startSeconds;
    }
    audio.play().catch(() => {});
    this.current = {
      stop: () => { try { audio.pause(); audio.src = ''; } catch { } },
      setBaseVolume: (v) => { audio.volume = (applyMasterVolume(v) / 100) * 0.6; },
      seek: (s) => { try { audio.currentTime = s; } catch { } },
    };
  }

  destroy() {
    this.stop();
  }

  // ── MIDI ──

  private async playMidi(url: string, volume: number = 50) {
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

    const MP = window.MidiPlayer;
    const SF = window.Soundfont;
    if (!MP || !SF) return;

    const ctx = new (window.AudioContext || window.webkitAudioContext)!();
    if (ctx.state === 'suspended') await ctx.resume();

    const inst = await SF.instrument(ctx, 'lead_1_square', { soundfont: 'MusyngKite' });
    const res = await fetch(url);
    if (!res.ok) return;
    const ab = await res.arrayBuffer();

    const player = new MP.Player((evt: MidiPlayerEvent) => {
      if (evt.name === 'Note on' && evt.velocity > 0) {
        inst.play(evt.noteName, ctx.currentTime, { gain: (evt.velocity / 127) * (applyMasterVolume(volume) / 50), duration: 0.25 });
      }
    });
    player.on('endOfFile', () => { try { player.stop(); player.play(); } catch { } });
    player.loadArrayBuffer(ab);
    player.play();

    this.current = {
      stop: () => { try { player.stop(); } catch { } ctx.close(); },
    };
  }

  // ── MML ──

  private mmlCtx: AudioContext | null = null;

  private async playMml(mml: string, loop?: BgmAsset['loop'], volume: number = 50) {
    const { playMML } = await import('@onjmin/dtm');
    const ctx = new (window.AudioContext || window.webkitAudioContext)!();
    if (ctx.state === 'suspended') await ctx.resume();
    this.mmlCtx = ctx;

    const loopOption = loop !== undefined ? toDtmLoopConfig(loop) : true;

    try {
      const bgm = playMML(mml, {
        audioContext: ctx,
        volume: applyMasterVolume(volume),
        loop: loopOption,
      });

      this.current = {
        stop: () => {
          try { bgm.stop(); } catch { }
          try { bgm.destroy(); } catch { }
          ctx.close();
        },
        setBaseVolume: (v) => { try { bgm.setVolume(applyMasterVolume(v)); } catch { } },
      };
    } catch (err) {
      console.error('Error playing MML BGM:', err);
      ctx.close();
    }
  }

  // ── YouTube ──

  private extractVideoId(url: string): { videoId: string; start?: number } | null {
    const m = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (!m) return null;
    let start: number | undefined;
    const tMatch = url.match(/(?:[?&]t=|\bstart=)(\d+)/);
    if (tMatch) {
      start = parseInt(tMatch[1], 10);
    }
    return { videoId: m[1], start };
  }

  private playYoutube(url: string, volume: number = 50, startSeconds: number = 0) {
    const extracted = this.extractVideoId(url);
    if (!extracted) return;
    const videoId = extracted.videoId;
    const finalStart = startSeconds > 0 ? startSeconds : (extracted.start || 0);

    const existing = document.querySelector('.bgm-youtube-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.className = 'bgm-youtube-container';
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(container);

    const playerDiv = document.createElement('div');
    playerDiv.id = 'bgm-youtube-player';
    container.appendChild(playerDiv);

    const loadYtApi = () => {
      if (window.YT && window.YT.Player) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        if (!document.getElementById('youtube-iframe-api-script')) {
          const tag = document.createElement('script');
          tag.id = 'youtube-iframe-api-script';
          tag.src = 'https://www.youtube.com/iframe_api';
          const firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        }
        const prevCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (prevCallback) prevCallback();
          resolve();
        };
        const check = setInterval(() => {
          if (window.YT && window.YT.Player) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    };

    let player: YtPlayerInstance | null = null;
    loadYtApi().then(() => {
      player = new window.YT!.Player('bgm-youtube-player', {
        height: '1',
        width: '1',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          loop: 1,
          playlist: videoId,
          controls: 0,
          start: Math.floor(finalStart),
        },
        events: {
          onReady: (event) => {
            event.target.setVolume(applyMasterVolume(volume));
            if (finalStart > 0) {
              try { event.target.seekTo(finalStart, true); } catch { }
            }
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (event.data === window.YT!.PlayerState.ENDED) {
              if (finalStart > 0) {
                try { event.target.seekTo(finalStart, true); } catch { }
              }
              event.target.playVideo();
            }
          }
        }
      });
    });

    this.current = {
      stop: () => {
        try { player?.destroy(); } catch { }
        container.remove();
      },
      setBaseVolume: (v) => { try { player?.setVolume(applyMasterVolume(v)); } catch { } },
      seek: (s) => { try { player?.seekTo(s, true); } catch { } },
    };
  }

  // ── ニコニコ動画 ──

  private extractNicovideoId(url: string): string | null {
    const m = url.match(/(sm\d+|so\d+|nm\d+|\d+)/i);
    return m ? m[1] : null;
  }

  private playNicovideo(url: string, volume: number = 50) {
    const videoId = this.extractNicovideoId(url);
    if (!videoId) return;

    const existing = document.querySelector('.bgm-nicovideo-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.className = 'bgm-nicovideo-container';
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(container);

    const iframe = document.createElement('iframe');
    iframe.src = `https://embed.nicovideo.jp/watch/${videoId}?jsapiversion=1&autoplay=1`;
    iframe.style.cssText = 'width:1px;height:1px;border:none';
    iframe.allow = 'autoplay';
    container.appendChild(iframe);

    const origin = 'https://embed.nicovideo.jp';
    const postMsg = (data: object) => {
      iframe.contentWindow?.postMessage(
        Object.assign({ sourceConnectorType: 1 }, data),
        origin
      );
    };

    const handleMsg = (e: MessageEvent) => {
      if (e.origin !== origin) return;
      const data = e.data?.data;
      switch (e.data?.eventName) {
        case 'playerStatusChange': {
          if (data?.playerStatus === 4) { // ended -> replay
            postMsg({ eventName: 'play' });
          }
          break;
        }
        case 'loadComplete': {
          postMsg({ eventName: 'volumeChange', data: { volume: (applyMasterVolume(volume) / 100) * 0.96 } });
          postMsg({ eventName: 'play' });
          break;
        }
      }
    };

    window.addEventListener('message', handleMsg);

    const initTimer = setTimeout(() => {
      postMsg({ eventName: 'volumeChange', data: { volume: (applyMasterVolume(volume) / 100) * 0.96 } });
      postMsg({ eventName: 'play' });
    }, 1200);

    this.current = {
      stop: () => {
        window.removeEventListener('message', handleMsg);
        clearTimeout(initTimer);
        try { postMsg({ eventName: 'pause' }); } catch { }
        container.remove();
      },
      setBaseVolume: (v) => {
        postMsg({ eventName: 'volumeChange', data: { volume: (applyMasterVolume(v) / 100) * 0.96 } });
      },
    };
  }

  // ── SoundCloud ──

  private playSoundCloud(url: string, volume: number = 50) {
    const existing = document.querySelector('.bgm-soundcloud-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.className = 'bgm-soundcloud-container';
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(container);

    const iframe = document.createElement('iframe');
    iframe.id = 'bgm-soundcloud-iframe';
    const soundcloudSrc = url.startsWith('http')
      ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`
      : url;
    iframe.src = soundcloudSrc;
    iframe.style.cssText = 'width:1px;height:1px;border:none';
    iframe.allow = 'autoplay';
    container.appendChild(iframe);

    const loadScSdk = () => {
      if (window.SC) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        if (!document.getElementById('soundcloud-widget-api-script')) {
          const tag = document.createElement('script');
          tag.id = 'soundcloud-widget-api-script';
          tag.src = 'https://w.soundcloud.com/player/api.js';
          const first = document.getElementsByTagName('script')[0];
          first?.parentNode?.insertBefore(tag, first);
        }
        const check = setInterval(() => {
          if (window.SC) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    };

    let widget: ScWidgetInstance | null = null;
    loadScSdk().then(() => {
      widget = window.SC!.Widget(iframe);
      widget.bind(window.SC!.Widget.Events.READY, () => {
        widget?.setVolume(applyMasterVolume(volume));
        widget?.play();
      });
      widget.bind(window.SC!.Widget.Events.FINISH, () => {
        widget?.play(); // loop
      });
    });

    this.current = {
      stop: () => {
        try { widget?.pause(); } catch { }
        container.remove();
      },
      setBaseVolume: (v) => {
        try { widget?.setVolume(applyMasterVolume(v)); } catch { }
      },
    };
  }
}

export const bgmManager = new BgmManager();
