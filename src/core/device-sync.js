import { SCHEMA_VERSION, migrateState } from '../storage/schema.js';
import { validateStateShape } from './validation.js';

const SYNC_APP_ID = 'LuminaFin';
const SYNC_KIND = 'device-sync';
const SYNC_VERSION = 1;
const MAX_SYNC_TEXT_LENGTH = 5 * 1024 * 1024;
const MERGE_COLLECTIONS = [
  'categories',
  'transactions',
  'fixedExpenses',
  'initialBalances',
  'goals',
  'savingsGoals',
  'scenarios',
  'coffers',
  'creditCards',
  'creditInvoices',
  'creditInstallments',
  'fxRates',
  'notifications',
  'deletedItems'
];
const TRASH_COLLECTIONS = {
  category: 'categories',
  transaction: 'transactions',
  fixedExpense: 'fixedExpenses',
  coffer: 'coffers',
  creditCard: 'creditCards',
  goal: 'goals'
};
const PAIRING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function timestampValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function entityTimestamp(entity) {
  return Math.max(timestampValue(entity?.updatedAt), timestampValue(entity?.deletedAt));
}

function compareEntityVersions(local, remote) {
  const timestampDifference = entityTimestamp(remote) - entityTimestamp(local);
  if (timestampDifference !== 0) return timestampDifference;
  const localVersion = Number.isInteger(local.version) ? local.version : 0;
  const remoteVersion = Number.isInteger(remote.version) ? remote.version : 0;
  if (remoteVersion !== localVersion) return remoteVersion - localVersion;
  const localDeleted = timestampValue(local.deletedAt);
  const remoteDeleted = timestampValue(remote.deletedAt);
  if (remoteDeleted !== localDeleted) return remoteDeleted - localDeleted;
  const localText = JSON.stringify(local);
  const remoteText = JSON.stringify(remote);
  return remoteText.localeCompare(localText);
}

function mergeCollection(localItems, remoteItems) {
  const merged = new Map();
  for (const entity of localItems) merged.set(entity.id, entity);
  for (const entity of remoteItems) {
    const current = merged.get(entity.id);
    if (!current || compareEntityVersions(current, entity) > 0) merged.set(entity.id, entity);
  }
  return [...merged.values()];
}

function latestState(local, remote) {
  const difference = timestampValue(remote.updatedAt) - timestampValue(local.updatedAt);
  if (difference !== 0) return difference > 0 ? remote : local;
  return JSON.stringify(remote).localeCompare(JSON.stringify(local)) > 0 ? remote : local;
}

export function createSyncEnvelope(state) {
  const issues = validateStateShape(state);
  if (issues.length) throw new TypeError(`Estado local inválido: ${issues.slice(0, 3).join('; ')}`);
  return {
    app: SYNC_APP_ID,
    kind: SYNC_KIND,
    version: SYNC_VERSION,
    createdAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state))
  };
}

export function validateSyncEnvelope(envelope) {
  if (!isRecord(envelope)
    || envelope.app !== SYNC_APP_ID
    || envelope.kind !== SYNC_KIND
    || envelope.version !== SYNC_VERSION
    || !isRecord(envelope.state)) {
    throw new TypeError('Pacote de sincronização inválido ou incompatível.');
  }
  for (const collection of MERGE_COLLECTIONS) {
    if (!Array.isArray(envelope.state[collection])) {
      throw new TypeError(`O pacote está incompleto: ${collection} não é uma lista.`);
    }
  }
  if (!isRecord(envelope.state.settings) || !isRecord(envelope.state.cofferSettings)) {
    throw new TypeError('O pacote está incompleto: configurações ausentes.');
  }
  const state = migrateState(envelope.state);
  const issues = validateStateShape(state);
  if (issues.length) throw new TypeError(`Pacote rejeitado: ${issues.slice(0, 5).join('; ')}`);
  return state;
}

export function mergeSyncStates(localInput, remoteInput) {
  const local = migrateState(localInput);
  const remote = migrateState(remoteInput);
  const issues = [...validateStateShape(local), ...validateStateShape(remote)];
  if (issues.length) throw new TypeError(`Não foi possível mesclar estados inválidos: ${issues.slice(0, 5).join('; ')}`);

  const configSource = latestState(local, remote);
  const merged = {
    ...local,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date(Math.max(timestampValue(local.updatedAt), timestampValue(remote.updatedAt))).toISOString(),
    settings: JSON.parse(JSON.stringify(configSource.settings)),
    cofferSettings: JSON.parse(JSON.stringify(configSource.cofferSettings)),
    missions: {
      ...(timestampValue(remote.missions?.updatedAt) > timestampValue(local.missions?.updatedAt)
        ? remote.missions
        : local.missions),
      completedIds: [...new Set([
        ...(local.missions?.completedIds || []),
        ...(remote.missions?.completedIds || [])
      ])]
    }
  };

  for (const collection of MERGE_COLLECTIONS) {
    merged[collection] = mergeCollection(local[collection], remote[collection]);
  }

  const activeTrash = [];
  for (const trashItem of merged.deletedItems) {
    const collection = TRASH_COLLECTIONS[trashItem.type];
    const entityId = trashItem.entityId || trashItem.data?.id;
    if (!collection || !entityId) {
      activeTrash.push(trashItem);
      continue;
    }
    const currentEntity = merged[collection].find((item) => item.id === entityId);
    if (currentEntity && timestampValue(currentEntity.updatedAt) > timestampValue(trashItem.deletedAt)) {
      continue;
    }
    if (currentEntity && timestampValue(trashItem.deletedAt) >= timestampValue(currentEntity.updatedAt)) {
      merged[collection] = merged[collection].filter((item) => item.id !== entityId);
    }
    activeTrash.push(trashItem);
  }
  merged.deletedItems = activeTrash;

  const mergedIssues = validateStateShape(merged);
  if (mergedIssues.length) {
    throw new TypeError(`Mesclagem rejeitada: ${mergedIssues.slice(0, 5).join('; ')}`);
  }
  return merged;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function transformBytes(bytes, streamType) {
  const StreamConstructor = globalThis[streamType];
  if (typeof StreamConstructor !== 'function') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new StreamConstructor('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeSyncPackage(envelope) {
  const validated = validateSyncEnvelope(envelope);
  const bytes = new globalThis.TextEncoder().encode(JSON.stringify({
    ...envelope,
    state: validated
  }));
  if (bytes.length > MAX_SYNC_TEXT_LENGTH) throw new RangeError('O pacote excede o limite de sincronização local.');
  const compressed = await transformBytes(bytes, 'CompressionStream');
  if (compressed && compressed.length < bytes.length) return `LF1Z.${bytesToBase64Url(compressed)}`;
  return `LF1.${bytesToBase64Url(bytes)}`;
}

export async function decodeSyncPackage(encoded) {
  if (typeof encoded !== 'string' || encoded.length > MAX_SYNC_TEXT_LENGTH * 2) {
    throw new TypeError('Pacote de sincronização vazio ou muito grande.');
  }
  let bytes;
  if (encoded.startsWith('LF1Z.')) {
    const compressedBytes = base64UrlToBytes(encoded.slice(5));
    bytes = await transformBytes(compressedBytes, 'DecompressionStream');
    if (!bytes) throw new Error('Este navegador não oferece suporte para descomprimir o pacote.');
  } else if (encoded.startsWith('LF1.')) {
    bytes = base64UrlToBytes(encoded.slice(4));
  } else {
    throw new TypeError('Formato de pacote desconhecido.');
  }
  if (bytes.length > MAX_SYNC_TEXT_LENGTH) throw new RangeError('O pacote descomprimido excede o limite permitido.');
  let envelope;
  try {
    envelope = JSON.parse(new globalThis.TextDecoder().decode(bytes));
  } catch {
    throw new TypeError('Não foi possível ler o conteúdo do pacote.');
  }
  return validateSyncEnvelope(envelope);
}

export function createPairingCode() {
  const values = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else for (let index = 0; index < values.length; index += 1) values[index] = Math.floor(Math.random() * 256);
  return [...values].map((value) => PAIRING_ALPHABET[value % PAIRING_ALPHABET.length]).join('');
}

export function parsePairingSignal(value, expectedKind = '') {
  let signal;
  try {
    signal = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new TypeError('Não foi possível ler o código de pareamento.');
  }
  if (!isRecord(signal)
    || signal.protocol !== 'luminafin-webrtc-v1'
    || !['offer', 'answer'].includes(signal.kind)
    || (expectedKind && signal.kind !== expectedKind)
    || typeof signal.code !== 'string'
    || !/^[2-9A-HJ-NP-Z]{6}$/.test(signal.code)
    || !isRecord(signal.description)
    || typeof signal.description.sdp !== 'string') {
    throw new TypeError('Código de pareamento inválido ou incompatível.');
  }
  return signal;
}

function waitForIceGathering(peer, timeoutMs = 12000) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('A coleta de conexão direta expirou. Confirme se os dispositivos estão na mesma rede.'));
    }, timeoutMs);
    const onStateChange = () => {
      if (peer.iceGatheringState === 'complete') {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      peer.removeEventListener('icegatheringstatechange', onStateChange);
    };
    peer.addEventListener('icegatheringstatechange', onStateChange);
  });
}

function attachSyncChannel(channel, onPackage, onStatus, packageText = '') {
  let chunks = [];
  let expectedChunks = 0;
  let sent = false;
  channel.addEventListener('open', async () => {
    onStatus?.('Canal direto criptografado conectado.');
    if (!packageText || sent) return;
    sent = true;
    const chunkSize = 16000;
    const total = Math.ceil(packageText.length / chunkSize);
    try {
      for (let index = 0; index < total; index += 1) {
        while (channel.bufferedAmount > 1024 * 1024) {
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        channel.send(JSON.stringify({
          type: 'sync-chunk',
          index,
          total,
          data: packageText.slice(index * chunkSize, (index + 1) * chunkSize)
        }));
      }
      onStatus?.('Pacote enviado diretamente ao outro dispositivo.');
    } catch (error) {
      onStatus?.(`Falha ao enviar o pacote: ${error.message}`);
    }
  });
  channel.addEventListener('message', (event) => {
    if (typeof event.data !== 'string' || event.data.length > 24000) return;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      onStatus?.('O outro dispositivo enviou dados em formato inválido.');
      return;
    }
    if (message.type !== 'sync-chunk'
      || !Number.isInteger(message.index)
      || !Number.isInteger(message.total)
      || message.total < 1 || message.total > 512
      || message.index < 0 || message.index >= message.total
      || typeof message.data !== 'string') return;
    if (expectedChunks && expectedChunks !== message.total) {
      chunks = [];
      expectedChunks = 0;
      onStatus?.('O pacote recebido estava inconsistente; tente novamente.');
      return;
    }
    expectedChunks = message.total;
    chunks[message.index] = message.data;
    if (chunks.filter((chunk) => typeof chunk === 'string').length === expectedChunks) {
      onPackage?.(chunks.join(''));
      chunks = [];
      expectedChunks = 0;
    }
  });
  channel.addEventListener('close', () => onStatus?.('Conexão direta encerrada.'));
  channel.addEventListener('error', () => onStatus?.('Ocorreu um erro na conexão direta.'));
}

export async function createP2POffer(packageText, { onPackage, onStatus } = {}) {
  if (typeof globalThis.RTCPeerConnection !== 'function') throw new Error('Este navegador não oferece WebRTC.');
  const peer = new globalThis.RTCPeerConnection({ iceServers: [] });
  const channel = peer.createDataChannel('luminafin-sync', { ordered: true });
  attachSyncChannel(channel, onPackage, onStatus, packageText);
  peer.addEventListener('connectionstatechange', () => onStatus?.(`Conexão: ${peer.connectionState}.`));
  const code = createPairingCode();
  await peer.setLocalDescription(await peer.createOffer());
  await waitForIceGathering(peer);
  return {
    peer,
    code,
    signal: JSON.stringify({ protocol: 'luminafin-webrtc-v1', kind: 'offer', code, description: peer.localDescription })
  };
}

export async function acceptP2POffer(value, { onPackage, onStatus } = {}) {
  if (typeof globalThis.RTCPeerConnection !== 'function') throw new Error('Este navegador não oferece WebRTC.');
  const offer = parsePairingSignal(value, 'offer');
  const peer = new globalThis.RTCPeerConnection({ iceServers: [] });
  peer.addEventListener('datachannel', (event) => attachSyncChannel(event.channel, onPackage, onStatus));
  peer.addEventListener('connectionstatechange', () => onStatus?.(`Conexão: ${peer.connectionState}.`));
  await peer.setRemoteDescription(offer.description);
  await peer.setLocalDescription(await peer.createAnswer());
  await waitForIceGathering(peer);
  return {
    peer,
    code: offer.code,
    signal: JSON.stringify({
      protocol: 'luminafin-webrtc-v1',
      kind: 'answer',
      code: offer.code,
      description: peer.localDescription
    })
  };
}

export async function acceptP2PAnswer(session, value) {
  if (!session?.peer || typeof session.code !== 'string') throw new TypeError('Sessão de origem inexistente.');
  const answer = parsePairingSignal(value, 'answer');
  if (answer.code !== session.code) throw new TypeError('O código de pareamento não corresponde a esta sessão.');
  await session.peer.setRemoteDescription(answer.description);
}

export function closeP2PSession(session) {
  if (!session?.peer) return;
  session.peer.close();
}
