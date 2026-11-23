import {
  AzureBlobUpload,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
} from 'livekit-server-sdk';
import { prisma } from '../../../database/prisma.js';
import { env } from '../../../config/env.js';
import { AppError } from '../../../utils/AppError.js';
import { logger } from '../../../infrastructure/logging/logger.js';
import {
  buildRecordingObjectKey,
  createDownloadUrl,
  getAzureUploadConfig,
  isStorageConfigured,
} from '../../../infrastructure/storage/azureBlob.js';
import {
  getLiveKitApiHost,
  isLiveKitConfigured,
  requireLiveKitConfig,
} from '../../livekit/config.js';
import * as meetingRepo from '../../meetings/repositories/meetingRepository.js';
import * as participantRepo from '../../meetings/repositories/participantRepository.js';
import { assertHost } from '../../meetings/utils/permissions.js';
import { writeAuditLog } from '../../auth/repositories/auditRepository.js';
import { notifyParticipantEvent } from '../../notifications/services/notificationService.js';

function getEgressClient() {
  requireLiveKitConfig();
  return new EgressClient(
    getLiveKitApiHost(),
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
  );
}

function retentionDays() {
  return Number(env.RECORDING_RETENTION_DAYS || 30);
}

export function serializeRecording(recording, { downloadUrl } = {}) {
  return {
    id: recording.id,
    meetingId: recording.meetingId,
    status: recording.status,
    egressId: recording.egressId,
    storageKey: recording.storageKey,
    mimeType: recording.mimeType,
    sizeBytes:
      recording.sizeBytes === null || recording.sizeBytes === undefined
        ? null
        : Number(recording.sizeBytes),
    durationSec: recording.durationSec,
    startedAt: recording.startedAt,
    completedAt: recording.completedAt,
    expiresAt: recording.expiresAt,
    metadata: recording.metadata,
    createdAt: recording.createdAt,
    updatedAt: recording.updatedAt,
    ...(downloadUrl ? { downloadUrl } : {}),
  };
}

async function assertCanManageRecording(meetingId, user) {
  const meeting = await meetingRepo.findMeetingById(meetingId);
  if (!meeting) {
    throw new AppError('Meeting not found', 404, { code: 'MEETING_NOT_FOUND' });
  }

  const participant = await participantRepo.findParticipant(meetingId, user.id);
  if (meeting.ownerId !== user.id) {
    assertHost(participant);
  }

  return { meeting, participant };
}

export async function startRecording(meetingId, user, context = {}) {
  if (!isLiveKitConfigured()) {
    throw new AppError('LiveKit is not configured', 503, {
      code: 'LIVEKIT_NOT_CONFIGURED',
    });
  }
  if (!isStorageConfigured()) {
    throw new AppError('Object storage is not configured', 503, {
      code: 'STORAGE_NOT_CONFIGURED',
    });
  }

  const { meeting } = await assertCanManageRecording(meetingId, user);

  if (meeting.status !== 'LIVE') {
    throw new AppError('Recordings can only start while the meeting is live', 409, {
      code: 'MEETING_NOT_LIVE',
    });
  }

  if (!meeting.livekitRoomName) {
    throw new AppError('Media room is not provisioned yet', 409, {
      code: 'LIVEKIT_ROOM_MISSING',
    });
  }

  const active = await prisma.meetingRecording.findFirst({
    where: {
      meetingId,
      deletedAt: null,
      status: { in: ['STARTING', 'ACTIVE'] },
    },
  });

  if (active) {
    throw new AppError('A recording is already in progress', 409, {
      code: 'RECORDING_IN_PROGRESS',
    });
  }

  const filename = `${Date.now()}.mp4`;
  const storageKey = buildRecordingObjectKey(meetingId, filename);
  const azure = getAzureUploadConfig();

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: storageKey,
    output: {
      case: 'azure',
      value: new AzureBlobUpload({
        accountName: azure.accountName,
        accountKey: azure.accountKey,
        containerName: azure.containerName,
      }),
    },
  });

  const recording = await prisma.meetingRecording.create({
    data: {
      meetingId,
      status: 'STARTING',
      storageKey,
      mimeType: 'video/mp4',
      startedAt: new Date(),
      metadata: {
        startedBy: user.id,
        roomName: meeting.livekitRoomName,
      },
    },
  });

  try {
    const egress = await getEgressClient().startRoomCompositeEgress(
      meeting.livekitRoomName,
      output,
      { layout: 'grid' },
    );

    const updated = await prisma.meetingRecording.update({
      where: { id: recording.id },
      data: {
        status: 'ACTIVE',
        egressId: egress.egressId,
        metadata: {
          ...(recording.metadata ?? {}),
          egressStatus: egress.status,
        },
      },
    });

    await writeAuditLog({
      actorId: user.id,
      action: 'recording.start',
      resource: 'meeting_recording',
      resourceId: updated.id,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      metadata: { meetingId, egressId: egress.egressId },
    });

    await notifyParticipantEvent({
      userId: meeting.ownerId,
      type: 'recording.started',
      title: 'Recording started',
      body: `Recording started for ${meeting.title}`,
      payload: { meetingId, recordingId: updated.id },
    });

    return serializeRecording(updated);
  } catch (error) {
    logger.error({ err: error, meetingId }, 'recording.start_failed');
    await prisma.meetingRecording.update({
      where: { id: recording.id },
      data: {
        status: 'FAILED',
        metadata: {
          ...(recording.metadata ?? {}),
          error: error instanceof Error ? error.message : 'unknown',
        },
      },
    });
    throw new AppError('Failed to start recording', 502, {
      code: 'RECORDING_START_FAILED',
    });
  }
}

export async function stopRecording(meetingId, user, context = {}) {
  const { meeting } = await assertCanManageRecording(meetingId, user);

  const active = await prisma.meetingRecording.findFirst({
    where: {
      meetingId,
      deletedAt: null,
      status: { in: ['STARTING', 'ACTIVE'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!active) {
    throw new AppError('No active recording found', 404, {
      code: 'RECORDING_NOT_FOUND',
    });
  }

  if (active.egressId && isLiveKitConfigured()) {
    try {
      await getEgressClient().stopEgress(active.egressId);
    } catch (error) {
      logger.warn({ err: error, egressId: active.egressId }, 'recording.stop_egress_failed');
    }
  }

  const updated = await prisma.meetingRecording.update({
    where: { id: active.id },
    data: {
      status: 'STOPPING',
      metadata: {
        ...(active.metadata ?? {}),
        stoppedBy: user.id,
      },
    },
  });

  await writeAuditLog({
    actorId: user.id,
    action: 'recording.stop',
    resource: 'meeting_recording',
    resourceId: updated.id,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: { meetingId },
  });

  await notifyParticipantEvent({
    userId: meeting.ownerId,
    type: 'recording.stopped',
    title: 'Recording stopping',
    body: `Recording is finalizing for ${meeting.title}`,
    payload: { meetingId, recordingId: updated.id },
  });

  return serializeRecording(updated);
}

export async function listRecordingsForUser(userId, { meetingId, limit = 50 } = {}) {
  const recordings = await prisma.meetingRecording.findMany({
    where: {
      deletedAt: null,
      ...(meetingId ? { meetingId } : {}),
      meeting: {
        OR: [
          { ownerId: userId },
          {
            participants: {
              some: {
                userId,
                role: { in: ['HOST', 'CO_HOST'] },
              },
            },
          },
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });

  return recordings.map((item) => serializeRecording(item));
}

export async function getRecordingDownload(recordingId, user) {
  const recording = await prisma.meetingRecording.findFirst({
    where: { id: recordingId, deletedAt: null },
    include: {
      meeting: {
        include: {
          participants: {
            where: { userId: user.id },
            take: 1,
          },
        },
      },
    },
  });

  if (!recording) {
    throw new AppError('Recording not found', 404, { code: 'RECORDING_NOT_FOUND' });
  }

  const isOwner = recording.meeting.ownerId === user.id;
  const isHost = recording.meeting.participants.some((p) =>
    ['HOST', 'CO_HOST'].includes(p.role),
  );

  if (!isOwner && !isHost && !['ADMIN', 'SUPER_ADMIN'].includes(user.globalRole)) {
    throw new AppError('Insufficient permissions', 403, { code: 'FORBIDDEN' });
  }

  if (recording.status !== 'COMPLETED' || !recording.storageKey) {
    throw new AppError('Recording is not ready for download', 409, {
      code: 'RECORDING_NOT_READY',
    });
  }

  if (recording.expiresAt && recording.expiresAt.getTime() <= Date.now()) {
    throw new AppError('Recording has expired', 410, { code: 'RECORDING_EXPIRED' });
  }

  const downloadUrl = await createDownloadUrl(recording.storageKey, {
    expiresInSeconds: Number(env.RECORDING_DOWNLOAD_TTL_SECONDS || 3600),
  });

  return serializeRecording(recording, { downloadUrl });
}

export async function applyEgressWebhookUpdate(egress) {
  if (!egress?.egressId) {
    return { handled: false };
  }

  const recording = await prisma.meetingRecording.findFirst({
    where: { egressId: egress.egressId, deletedAt: null },
  });

  if (!recording) {
    return { handled: false, reason: 'unknown_egress' };
  }

  const statusMap = {
    EGRESS_COMPLETE: 'COMPLETED',
    EGRESS_FAILED: 'FAILED',
    EGRESS_ABORTED: 'FAILED',
    EGRESS_ENDING: 'STOPPING',
    EGRESS_ACTIVE: 'ACTIVE',
    EGRESS_STARTING: 'STARTING',
  };

  const nextStatus = statusMap[egress.status] ?? recording.status;
  const fileResult = egress.fileResults?.[0] ?? egress.file?.filename ? egress.file : null;

  const expiresAt =
    nextStatus === 'COMPLETED'
      ? new Date(Date.now() + retentionDays() * 24 * 60 * 60 * 1000)
      : recording.expiresAt;

  const updated = await prisma.meetingRecording.update({
    where: { id: recording.id },
    data: {
      status: nextStatus,
      completedAt: nextStatus === 'COMPLETED' ? new Date() : recording.completedAt,
      expiresAt,
      sizeBytes:
        fileResult?.size !== undefined && fileResult?.size !== null
          ? BigInt(fileResult.size)
          : recording.sizeBytes,
      durationSec:
        fileResult?.duration !== undefined && fileResult?.duration !== null
          ? Math.round(Number(fileResult.duration) / 1e9)
          : recording.durationSec,
      storageUrl: fileResult?.location ?? recording.storageUrl,
      metadata: {
        ...(recording.metadata ?? {}),
        egressStatus: egress.status,
        fileResult: fileResult
          ? {
              filename: fileResult.filename,
              location: fileResult.location,
              size: fileResult.size?.toString?.() ?? fileResult.size,
            }
          : undefined,
      },
    },
  });

  return { handled: true, recordingId: updated.id, status: updated.status };
}
