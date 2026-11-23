import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import { env } from '../../config/env.js';
import {
  getLiveKitApiHost,
  isLiveKitConfigured,
  requireLiveKitConfig,
} from './config.js';

let roomClient;
let webhookReceiver;

export function getRoomServiceClient() {
  requireLiveKitConfig();

  if (!roomClient) {
    roomClient = new RoomServiceClient(
      getLiveKitApiHost(),
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );
  }

  return roomClient;
}

export function getWebhookReceiver() {
  requireLiveKitConfig();

  if (!webhookReceiver) {
    webhookReceiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  }

  return webhookReceiver;
}

export function createAccessToken(options) {
  requireLiveKitConfig();
  return new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, options);
}

export function resetLiveKitClients() {
  roomClient = undefined;
  webhookReceiver = undefined;
}

export { isLiveKitConfigured };
