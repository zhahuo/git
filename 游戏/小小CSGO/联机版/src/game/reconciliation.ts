export type MovementInput = { seq: number; forward: number; right: number; yaw: number; sprint: boolean; duration: number };
export type GroundPosition = { x: number; z: number };

export function replayUnacknowledged(authoritative: GroundPosition, inputs: MovementInput[], acknowledgedSeq: number) {
  const pending = inputs.filter((input) => input.seq > acknowledgedSeq);
  const position = pending.reduce<GroundPosition>((next, input) => {
    const length = Math.hypot(input.forward, input.right);
    if (length === 0) return next;
    const speed = input.sprint ? 12 : 7;
    const distance = speed * Math.max(0, Math.min(0.1, input.duration)) / Math.max(1, length);
    return {
      x: next.x + (-Math.sin(input.yaw) * input.forward + Math.cos(input.yaw) * input.right) * distance,
      z: next.z + (-Math.cos(input.yaw) * input.forward - Math.sin(input.yaw) * input.right) * distance,
    };
  }, { ...authoritative });
  return { position, pending };
}

export function reconcileMovement(authoritative: GroundPosition, rendered: GroundPosition, inputs: MovementInput[], acknowledgedSeq: number, hardSnapDistance = 3) {
  const { position, pending } = replayUnacknowledged(authoritative, inputs, acknowledgedSeq);
  const correction = { x: position.x - rendered.x, z: position.z - rendered.z };
  return { position, pending, correction, hardSnap: Math.hypot(correction.x, correction.z) > hardSnapDistance };
}
