import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../logging/logger.js';

let credential;
let serviceClient;
let containerEnsured = false;

export function isStorageConfigured() {
  return Boolean(
    env.AZURE_STORAGE_ACCOUNT_NAME &&
      env.AZURE_STORAGE_ACCOUNT_KEY &&
      env.AZURE_STORAGE_CONTAINER,
  );
}

function requireStorageConfig() {
  if (!isStorageConfigured()) {
    throw new AppError('Object storage is not configured', 503, {
      code: 'STORAGE_NOT_CONFIGURED',
    });
  }
}

function getCredential() {
  requireStorageConfig();
  if (!credential) {
    credential = new StorageSharedKeyCredential(
      env.AZURE_STORAGE_ACCOUNT_NAME,
      env.AZURE_STORAGE_ACCOUNT_KEY,
    );
  }
  return credential;
}

function getBlobServiceUrl() {
  if (env.AZURE_STORAGE_BLOB_ENDPOINT) {
    return env.AZURE_STORAGE_BLOB_ENDPOINT.replace(/\/$/, '');
  }
  return `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`;
}

export function getBlobServiceClient() {
  requireStorageConfig();
  if (!serviceClient) {
    serviceClient = new BlobServiceClient(getBlobServiceUrl(), getCredential());
  }
  return serviceClient;
}

export function getContainerClient() {
  return getBlobServiceClient().getContainerClient(env.AZURE_STORAGE_CONTAINER);
}

async function ensureContainer() {
  const container = getContainerClient();
  if (!containerEnsured) {
    await container.createIfNotExists();
    containerEnsured = true;
  }
  return container;
}

export function buildRecordingObjectKey(meetingId, filename) {
  const safeName = String(filename || `${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `recordings/${meetingId}/${safeName}`;
}

function buildSasUrl(blobName, permissions, expiresInSeconds) {
  const startsOn = new Date(Date.now() - 60_000);
  const expiresOn = new Date(Date.now() + expiresInSeconds * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: env.AZURE_STORAGE_CONTAINER,
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      startsOn,
      expiresOn,
    },
    getCredential(),
  ).toString();

  const blobClient = getContainerClient().getBlockBlobClient(blobName);
  return `${blobClient.url}?${sas}`;
}

export async function createDownloadUrl(key, { expiresInSeconds = 3600 } = {}) {
  await ensureContainer();
  return buildSasUrl(key, 'r', expiresInSeconds);
}

export async function createUploadUrl(
  key,
  _contentType = 'application/octet-stream',
  expiresInSeconds = 900,
) {
  await ensureContainer();
  return buildSasUrl(key, 'cw', expiresInSeconds);
}

export async function deleteObject(key) {
  const container = await ensureContainer();
  await container.getBlockBlobClient(key).deleteIfExists();
}

/** Credentials for LiveKit egress AzureBlobUpload. */
export function getAzureUploadConfig() {
  requireStorageConfig();
  return {
    accountName: env.AZURE_STORAGE_ACCOUNT_NAME,
    accountKey: env.AZURE_STORAGE_ACCOUNT_KEY,
    containerName: env.AZURE_STORAGE_CONTAINER,
  };
}

export async function checkStorageHealth() {
  if (!isStorageConfigured()) {
    return { status: 'unconfigured' };
  }

  const started = Date.now();
  try {
    const container = await ensureContainer();
    await container.getProperties();
    return { status: 'up', latencyMs: Date.now() - started };
  } catch (error) {
    logger.warn({ err: error }, 'storage.health_check_failed');
    return {
      status: 'degraded',
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export function resetAzureBlobClient() {
  credential = undefined;
  serviceClient = undefined;
  containerEnsured = false;
}
