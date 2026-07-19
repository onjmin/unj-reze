'use client';

import type { FingerprintSignals } from '@/lib/security/types';

// Canvas は固定の width/height 属性で描画する（CSSでの表示サイズとは無関係）。
// ブラウザのズームやOSの表示スケーリング（125%/150%など）は canvas の実描画には影響しないため、
// ここを固定しておくことでズームレベル起因のハッシュ不一致を防げる。
const CANVAS_WIDTH = 280;
const CANVAS_HEIGHT = 60;

function collectCanvasSignal(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('unj-reze fp 🎮 あいう', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('unj-reze fp 🎮 あいう', 4, 17);

    return canvas.toDataURL();
  } catch {
    return '';
  }
}

function collectWebglSignal(): { vendor: string | null; renderer: string | null } {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { vendor: null, renderer: null };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return { vendor: null, renderer: null };

    return {
      vendor: String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)),
      renderer: String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)),
    };
  } catch {
    return { vendor: null, renderer: null };
  }
}

/** 軽量・低エントロピーだが持続的なデバイス信号を収集する。
 * 単一ハッシュにはせず、サーバー側で重み付け評価できるよう生の構造化データのまま返す。 */
export function collectFingerprint(): FingerprintSignals {
  const webgl = collectWebglSignal();
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;

  return {
    canvas: collectCanvasSignal(),
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
    deviceMemory: (nav as unknown as { deviceMemory?: number } | undefined)?.deviceMemory ?? null,
    screen: typeof screen !== 'undefined' ? {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    } : { width: 0, height: 0, colorDepth: 0, pixelRatio: 1 },
    timezone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
      } catch {
        return null;
      }
    })(),
    language: nav?.language ?? null,
    languages: nav?.languages ? Array.from(nav.languages) : [],
    platform: nav?.platform ?? null,
  };
}
