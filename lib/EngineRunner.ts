import type { GameManifest, Genre } from './game-config';
import type { AssetProvider } from './AssetProvider';
import { BaseGameEngine } from './engines/BaseGameEngine';
import { RPGEngine } from './engines/RPGEngine';
import { PlatformerEngine } from './engines/PlatformerEngine';
import { BulletHellEngine } from './engines/BulletHellEngine';
import { bgmManager } from './BgmManager';

const ENGINE_MAP: Record<Genre, new () => BaseGameEngine> = {
  'rpg': RPGEngine,
  'platformer': PlatformerEngine,
  'bullet-hell': BulletHellEngine,
};

export class EngineRunner {
  private canvas: HTMLCanvasElement | null = null;
  private engine: BaseGameEngine | null = null;

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  get currentGenre(): Genre | null {
    return this.engine ? this.engine.genre as Genre : null;
  }

  async load(manifest: GameManifest, assets: AssetProvider) {
    this.unloadEngine();

    if (!this.canvas) throw new Error('EngineRunner: canvas not set');

    const EngineClass = ENGINE_MAP[manifest.genre];
    if (!EngineClass) throw new Error(`EngineRunner: unknown genre "${manifest.genre}"`);

    const engine = new EngineClass();
    engine.init({ canvas: this.canvas, manifest, assets });
    engine.start();
    this.engine = engine;

    bgmManager.play(manifest.assets);
  }

  async switchGame(manifest: GameManifest, assets: AssetProvider) {
    await this.load(manifest, assets);
  }

  setInput(input: { left?: boolean; right?: boolean; up?: boolean; down?: boolean; action1?: boolean; action2?: boolean }) {
    if (!this.engine) return;
    const e = this.engine;
    if (input.left !== undefined) e.input.left = input.left;
    if (input.right !== undefined) e.input.right = input.right;
    if (input.up !== undefined) e.input.up = input.up;
    if (input.down !== undefined) e.input.down = input.down;
    if (input.action1 !== undefined) e.input.action1 = input.action1;
    if (input.action2 !== undefined) e.input.action2 = input.action2;
  }

  private unloadEngine() {
    if (this.engine) { this.engine.destroy(); this.engine = null; }
  }

  unload() {
    this.unloadEngine();
    bgmManager.stop();
  }
}
