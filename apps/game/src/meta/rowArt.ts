import type Phaser from 'phaser';
import type { CoatId, EquipmentId, RecipeId } from '@nyan-noodle/sim';
import { ATLAS_KEY } from '../shop/CatActor';

/** Atlas frames for menu-row art. All of these already ship in the procedural atlas. */
export const RECIPE_ICON: Readonly<Record<RecipeId, string>> = {
  shoyu: 'food/bowl_shoyu',
  miso: 'food/bowl_miso',
  tonkotsu: 'food/bowl_tonkotsu',
};

export const EQUIPMENT_ICON: Readonly<Record<EquipmentId, string>> = {
  knives: 'icon/hammer',
  burner: 'icon/flame',
  signboard: 'furniture/sign',
};

/** Sakura cats share the tabby sprite until a sakura portrait is drawn in `scripts/art/cats.mjs`. */
export function catPortrait(coat: CoatId): string {
  const frame = `cat/${coat}/down/idle_0`;
  return coat === 'sakura' ? 'cat/tabby/down/idle_0' : frame;
}

/** Integer-positioned atlas icon; origin at the row's top-left corner. */
export function rowIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  frame: string,
  cropHeight?: number,
): Phaser.GameObjects.Image {
  const image = scene.add.image(Math.round(x), Math.round(y), ATLAS_KEY, frame).setOrigin(0, 0);
  if (cropHeight !== undefined) image.setCrop(0, 0, image.width, cropHeight);
  return image;
}
