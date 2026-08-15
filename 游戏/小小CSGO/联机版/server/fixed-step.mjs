export function advanceFixedSteps(accumulatorMs, elapsedMs, stepMs, maxCatchUpSteps) {
  const cappedElapsed = Math.max(0, elapsedMs);
  const maximum = stepMs * maxCatchUpSteps;
  const combined = Math.max(0, accumulatorMs) + cappedElapsed;
  const droppedMs = Math.max(0, combined - maximum);
  const bounded = Math.min(combined, maximum);
  const steps = Math.floor(bounded / stepMs);
  return { steps, accumulatorMs: bounded - steps * stepMs, droppedMs };
}
