import type { AssetManifest } from './game-config';
import { applyMasterVolume, subscribeMasterVolume } from './master-volume';

interface BgmHandle {
  stop: () => void;
  /** マスター音量変更時に即時反映するための再設定（対応できない再生方式は省略可）。 */
  setBaseVolume?: (baseVolume: number) => void;
}

class BgmManager {
  private current: BgmHandle | null = null;
  private baseVolume = 50;

  constructor() {
    subscribeMasterVolume(() => this.current?.setBaseVolume?.(this.baseVolume));
  }

  async play(manifest: AssetManifest) {
    this.stop();
    if (!manifest.bgm || !manifest.bgm.src) return;

    const volume = (manifest.bgm as any).volume !== undefined ? (manifest.bgm as any).volume : 50;
    this.baseVolume = volume;

    if (manifest.bgm.type === 'midi') {
      await this.playMidi(manifest.bgm.src, volume);
    } else if (manifest.bgm.type === 'youtube') {
      this.playYoutube(manifest.bgm.src, volume);
    } else if (manifest.bgm.type === 'nicovideo') {
      this.playNicovideo(manifest.bgm.src, volume);
    } else if (manifest.bgm.type === 'soundcloud') {
      this.playSoundCloud(manifest.bgm.src, volume);
    } else if (manifest.bgm.type === 'mml') {
      this.playMml(manifest.bgm.src, manifest.bgm.loop, volume);
    } else if (manifest.bgm.type === 'direct') {
      this.playDirect(manifest.bgm.src, volume);
    }
  }

  stop() {
    if (this.current) { try { this.current.stop(); } catch (e) { } this.current = null; }
    document.querySelectorAll('.bgm-youtube-container, .bgm-nicovideo-container, .bgm-soundcloud-container').forEach(el => el.remove());
  }

  // ── 直リンク音声（MP3/WAV）をループ再生 ──

  private playDirect(url: string, volume: number = 50) {
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = (applyMasterVolume(volume) / 100) * 0.6;
    audio.play().catch(() => {});
    this.current = {
      stop: () => { try { audio.pause(); audio.src = ''; } catch (e) { } },
      setBaseVolume: (v) => { audio.volume = (applyMasterVolume(v) / 100) * 0.6; },
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
        inst.play(evt.noteName, ctx.currentTime, { gain: (evt.velocity / 127) * (applyMasterVolume(volume) / 50), duration: 0.25 });
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

  private mmlCtx: AudioContext | null = null;

  private async playMml(mml: string, loop?: any, volume: number = 50) {
    const { playMML } = await import('@onjmin/dtm');
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    this.mmlCtx = ctx;

    const loopOption = loop !== undefined ? loop : true;

    try {
      const bgm = playMML(mml, {
        audioContext: ctx,
        volume: applyMasterVolume(volume),
        loop: loopOption,
      });

      this.current = {
        stop: () => {
          try { bgm.stop(); } catch (e) {}
          try { bgm.destroy(); } catch (e) {}
          ctx.close();
        },
        setBaseVolume: (v) => { try { bgm.setVolume(applyMasterVolume(v)); } catch (e) {} },
      };
    } catch (err) {
      console.error('Error playing MML BGM:', err);
      ctx.close();
    }
  }

  // ── YouTube ──

  private extractVideoId(url: string): string | null {
    const m = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  private playYoutube(url: string, volume: number = 50) {
    const videoId = this.extractVideoId(url);
    if (!videoId) return;

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
      if ((window as any).YT && (window as any).YT.Player) {
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
        const prevCallback = (window as any).onYouTubeIframeAPIReady;
        (window as any).onYouTubeIframeAPIReady = () => {
          if (prevCallback) prevCallback();
          resolve();
        };
        const check = setInterval(() => {
          if ((window as any).YT && (window as any).YT.Player) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    };

    let player: any = null;
    loadYtApi().then(() => {
      player = new (window as any).YT.Player('bgm-youtube-player', {
        height: '1',
        width: '1',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          loop: 1,
          playlist: videoId,
          controls: 0,
        },
        events: {
          onReady: (event: any) => {
            event.target.setVolume(applyMasterVolume(volume));
            event.target.playVideo();
          },
          onStateChange: (event: any) => {
            if (event.data === (window as any).YT.PlayerState.ENDED) {
              event.target.playVideo();
            }
          }
        }
      });
    });

    this.current = {
      stop: () => {
        try { if (player && player.destroy) player.destroy(); } catch (e) {}
        container.remove();
      },
      setBaseVolume: (v) => { try { player?.setVolume(applyMasterVolume(v)); } catch (e) {} },
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
        try { postMsg({ eventName: 'pause' }); } catch (e) {}
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
      if ((window as any).SC && (window as any).SC.Widget) {
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
          if ((window as any).SC && (window as any).SC.Widget) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    };

    let widget: any = null;
    loadScSdk().then(() => {
      widget = (window as any).SC.Widget(iframe);
      widget.bind((window as any).SC.Widget.Events.READY, () => {
        widget.setVolume(applyMasterVolume(volume));
        widget.play();
      });
      widget.bind((window as any).SC.Widget.Events.FINISH, () => {
        widget.play(); // loop
      });
    });

    this.current = {
      stop: () => {
        try { if (widget) widget.pause(); } catch (e) {}
        container.remove();
      },
      setBaseVolume: (v) => {
        try { if (widget) widget.setVolume(applyMasterVolume(v)); } catch (e) {}
      },
    };
  }
}

export const bgmManager = new BgmManager();
