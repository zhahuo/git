const maxRequestSequence = 2 ** 31 - 1;

function isSequence(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maxRequestSequence;
}

function boundedNumber(value, minimum, maximum) {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : null;
}

function normalizeYaw(value) {
  if (!Number.isFinite(value)) return null;
  const turn = Math.PI * 2;
  return ((value + Math.PI) % turn + turn) % turn - Math.PI;
}

function optionalSequence(value) {
  return value === undefined ? undefined : isSequence(value) ? value : null;
}

export function normalizeInboundMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.type !== 'string') return null;
  if (value.type === 'input') {
    const forward = boundedNumber(value.forward, -1, 1);
    const right = boundedNumber(value.right, -1, 1);
    const yaw = normalizeYaw(value.yaw);
    if (forward === null || right === null || yaw === null || !isSequence(value.seq)) return null;
    return { type: 'input', forward, right, yaw, sprint: Boolean(value.sprint), seq: value.seq };
  }
  if (value.type === 'fire') {
    const shotSeq = optionalSequence(value.shotSeq);
    if (shotSeq === null) return null;
    const shotAt = value.shotAt === undefined ? undefined : Number.isFinite(value.shotAt) ? value.shotAt : null;
    if (shotAt === null) return null;
    return { type: 'fire', yaw: normalizeYaw(value.yaw), shotAt, shotSeq };
  }
  if (value.type === 'pickup') {
    const requestSeq = optionalSequence(value.requestSeq);
    if (requestSeq === null || typeof value.id !== 'string') return null;
    return { type: 'pickup', id: value.id.slice(0, 32), requestSeq };
  }
  if (value.type === 'weapon') {
    const requestSeq = optionalSequence(value.requestSeq);
    if (requestSeq === null || requestSeq === undefined || typeof value.id !== 'string') return null;
    return { type: 'weapon', id: value.id.slice(0, 32), requestSeq };
  }
  if (value.type === 'equip') {
    const requestSeq = optionalSequence(value.requestSeq);
    if (requestSeq === null || !Number.isSafeInteger(value.tier)) return null;
    return { type: 'equip', tier: value.tier, requestSeq };
  }
  if (value.type === 'reload' || value.type === 'ready') {
    const requestSeq = optionalSequence(value.requestSeq);
    if (requestSeq === null) return null;
    return value.type === 'ready' ? { type: 'ready', ready: Boolean(value.ready), requestSeq } : { type: 'reload', requestSeq };
  }
  if (value.type === 'queue' || value.type === 'queueCancel') {
    const requestSeq = optionalSequence(value.requestSeq);
    if (requestSeq === null || requestSeq === undefined) return null;
    return { type: value.type, requestSeq };
  }
  if (value.type === 'ping') return Number.isSafeInteger(value.id) ? { type: 'ping', id: value.id } : null;
  if (value.type === 'sync') return { type: 'sync' };
  if (value.type === 'journal') return isSequence(value.fromSeq) ? { type: 'journal', fromSeq: value.fromSeq } : null;
  if (value.type === 'chat') {
    if (typeof value.text !== 'string') return null;
    const scope = value.scope === 'team' ? 'team' : undefined;
    return scope ? { type: 'chat', text: value.text.trim().slice(0, 160), scope } : { type: 'chat', text: value.text.trim().slice(0, 160) };
  }
  return null;
}
