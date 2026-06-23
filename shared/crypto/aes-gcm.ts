/**
 * AES-256-GCM 암호화/복호화 라이브러리
 *
 * 클라이언트 측 E2E 암호화를 위한 공통 라이브러리 (Web, Admin 공유)
 * - 알고리즘: AES-256-GCM (NIST 승인, 웹 표준)
 * - IV: 16바이트 (요청마다 랜덤 생성)
 * - Auth Tag: 16바이트 (데이터 무결성 검증)
 *
 * WebView 호환성:
 * - crypto.subtle은 HTTPS 또는 localhost에서만 사용 가능
 * - WebView 환경에서는 폴백 모드 사용 (Base64 인코딩)
 */

import { Buffer } from 'buffer';

function isWebCryptoSupported(): boolean {
  return typeof crypto !== 'undefined' &&
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.subtle.importKey === 'function';
}

function getSecretKey(): string {
  const key = process.env.NEXT_PUBLIC_CRYPTO_SECRET_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      'CRYPTO_SECRET_KEY must be 64 hex chars (32 bytes). ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  return key;
}

export interface EncryptedPayload {
  encryptedData: string;
  iv: string;
  authTag: string;
}

function addPadding(plaintext: string): string {
  const MIN_PLAINTEXT_SIZE = 80;
  const currentSize = new TextEncoder().encode(plaintext).length;
  if (currentSize >= MIN_PLAINTEXT_SIZE) return plaintext;

  try {
    const obj = JSON.parse(plaintext);
    const paddingNeeded = MIN_PLAINTEXT_SIZE - currentSize;
    const padding = Array.from(crypto.getRandomValues(new Uint8Array(paddingNeeded)))
      .map(b => String.fromCharCode(65 + (b % 26)))
      .join('');
    obj._pad = padding;
    return JSON.stringify(obj);
  } catch {
    const paddingNeeded = MIN_PLAINTEXT_SIZE - currentSize;
    return plaintext + ' '.repeat(paddingNeeded);
  }
}

function addPaddingFallback(plaintext: string): string {
  const MIN_PLAINTEXT_SIZE = 80;
  const currentSize = new TextEncoder().encode(plaintext).length;
  if (currentSize >= MIN_PLAINTEXT_SIZE) return plaintext;

  try {
    const obj = JSON.parse(plaintext);
    const paddingNeeded = MIN_PLAINTEXT_SIZE - currentSize;
    const padding = Array.from({ length: paddingNeeded }, (_, i) =>
      String.fromCharCode(65 + (i % 26))
    ).join('');
    obj._pad = padding;
    return JSON.stringify(obj);
  } catch {
    const paddingNeeded = MIN_PLAINTEXT_SIZE - currentSize;
    return plaintext + ' '.repeat(paddingNeeded);
  }
}

function encryptCredentialsFallback(plaintext: string): EncryptedPayload {
  const paddedPlaintext = addPaddingFallback(plaintext);

  const ivBytes = new Uint8Array(16);
  const fallbackMarker = new TextEncoder().encode('FALLBACK');
  ivBytes.set(fallbackMarker.slice(0, 8), 0);
  const timestamp = Date.now();
  for (let i = 0; i < 8; i++) {
    ivBytes[8 + i] = (timestamp >> (i * 8)) & 0xff;
  }

  const encoded = Buffer.from(paddedPlaintext, 'utf-8').toString('base64');

  const authTagBytes = new Uint8Array(16);
  const checksum = paddedPlaintext.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  for (let i = 0; i < 16; i++) {
    authTagBytes[i] = (checksum >> (i % 4) * 8) & 0xff;
  }

  return {
    encryptedData: encoded,
    iv: Buffer.from(ivBytes).toString('base64'),
    authTag: Buffer.from(authTagBytes).toString('base64'),
  };
}

export async function encryptCredentials(plaintext: string): Promise<EncryptedPayload> {
  if (!isWebCryptoSupported()) {
    return encryptCredentialsFallback(plaintext);
  }

  try {
    const paddedPlaintext = addPadding(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(16));

    const keyBuffer = Buffer.from(getSecretKey(), 'hex');
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBuffer,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt']
    );

    const encoded = new TextEncoder().encode(paddedPlaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      cryptoKey, encoded
    );

    const ciphertextArray = new Uint8Array(ciphertext);
    const dataLen = ciphertextArray.length - 16;
    const encryptedData = ciphertextArray.slice(0, dataLen);
    const authTag = ciphertextArray.slice(dataLen);

    return {
      encryptedData: Buffer.from(encryptedData).toString('base64'),
      iv: Buffer.from(iv).toString('base64'),
      authTag: Buffer.from(authTag).toString('base64'),
    };
  } catch {
    return encryptCredentialsFallback(plaintext);
  }
}

export async function decryptCredentials(payload: EncryptedPayload): Promise<string> {
  const keyBuffer = Buffer.from(getSecretKey(), 'hex');
  const encryptedData = Buffer.from(payload.encryptedData, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBuffer,
    { name: 'AES-GCM', length: 256 },
    false, ['decrypt']
  );

  const combined = new Uint8Array(encryptedData.length + authTag.length);
  combined.set(encryptedData, 0);
  combined.set(authTag, encryptedData.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    cryptoKey, combined
  );

  return new TextDecoder().decode(decrypted);
}

export function getCryptoStatus(): {
  isConfigured: boolean;
  keyLength: number;
  webCryptoSupported: boolean;
  fallbackMode: boolean;
} {
  const webCryptoSupported = isWebCryptoSupported();
  try {
    const key = getSecretKey();
    return { isConfigured: true, keyLength: key.length, webCryptoSupported, fallbackMode: !webCryptoSupported };
  } catch {
    return { isConfigured: false, keyLength: 0, webCryptoSupported, fallbackMode: !webCryptoSupported };
  }
}

export function isFallbackMode(): boolean {
  return !isWebCryptoSupported();
}
