/*
 * Adapted from RemotePlayer.ts in https://github.com/vkopitsa/browser-shooter
 * Copyright (c) 2026 Browser Shooter contributors. MIT License.
 * The original license is preserved in licenses/browser-shooter-MIT.txt.
 */

import type { NetworkPlayer } from './store';

type InterpolationEntry = { x: number; z: number; yaw: number; time: number };
export type InterpolatedTransform = { x: number; z: number; yaw: number };

const INTERPOLATION_DELAY = 100;

function lerpAngle(from: number, to: number, amount: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
}

export class RemoteInterpolationBuffer {
  private entries: InterpolationEntry[] = [];

  push(player: NetworkPlayer, time = performance.now()) {
    this.entries.push({ x: player.x, z: player.z, yaw: player.yaw, time });
    while (this.entries.length > 10) this.entries.shift();
  }

  sample(renderTime = performance.now()): InterpolatedTransform | null {
    const targetTime = renderTime - INTERPOLATION_DELAY;
    if (this.entries.length === 0) return null;
    if (this.entries.length === 1) return this.entries[0];
    let before: InterpolationEntry | undefined;
    let after: InterpolationEntry | undefined;
    for (let index = 0; index < this.entries.length - 1; index += 1) {
      if (this.entries[index].time <= targetTime && this.entries[index + 1].time >= targetTime) {
        before = this.entries[index];
        after = this.entries[index + 1];
        break;
      }
    }
    if (!before || !after) return this.entries.at(-1)!;
    const amount = (targetTime - before.time) / (after.time - before.time);
    return { x: before.x + (after.x - before.x) * amount, z: before.z + (after.z - before.z) * amount, yaw: lerpAngle(before.yaw, after.yaw, amount) };
  }
}
