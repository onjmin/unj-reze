import type { AssetManifest } from './game-config';

export interface AssetProvider {
  resolveSprite(name: string, manifest: AssetManifest): Promise<HTMLImageElement | null>;
  getTileColor(tileType: number, manifest: AssetManifest): string;
}

export class MockAssetProvider implements AssetProvider {
  async resolveSprite(_name: string, _manifest: AssetManifest): Promise<HTMLImageElement | null> {
    return null;
  }

  getTileColor(tileType: number, manifest: AssetManifest): string {
    return manifest.tileset[tileType]?.color || '#333';
  }

  destroy() {}
}

export class ApiAssetProvider implements AssetProvider {
  async resolveSprite(_name: string, _manifest: AssetManifest): Promise<HTMLImageElement | null> {
    throw new Error('ApiAssetProvider.resolveSprite: not implemented');
  }

  getTileColor(tileType: number, manifest: AssetManifest): string {
    return manifest.tileset[tileType]?.color || '#333';
  }
}
