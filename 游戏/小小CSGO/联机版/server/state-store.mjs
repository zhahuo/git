import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULT_STATE_LIMIT = 1024 * 1024;

function safeFileName(name) {
  return /^[a-z0-9][a-z0-9-]{0,63}$/i.test(name) ? `${name}.json` : null;
}

export async function saveState(dir, name, data, limit = DEFAULT_STATE_LIMIT) {
  const fileName = safeFileName(name);
  if (!fileName) throw new Error('invalid state name');
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized) > limit) throw new Error('state exceeds size limit');
  await mkdir(dir, { recursive: true });
  const target = join(dir, fileName);
  const temp = `${target}.tmp`;
  await writeFile(temp, serialized, { encoding: 'utf8', flag: 'w' });
  await rename(temp, target);
  return true;
}

export async function loadState(dir, name, limit = DEFAULT_STATE_LIMIT) {
  const fileName = safeFileName(name);
  if (!fileName) return null;
  const target = join(dir, fileName);
  try {
    const meta = await stat(target);
    if (!meta.isFile() || meta.size > limit) return null;
    const raw = await readFile(target, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function removeState(dir, name) {
  const fileName = safeFileName(name);
  if (!fileName) return false;
  try {
    await rm(join(dir, fileName), { force: true });
    return true;
  } catch {
    return false;
  }
}
