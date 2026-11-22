const send = jest.fn();
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ send }),
}));

import type { App } from 'firebase-admin/app';
import { ExpoPushSender, isExpoPushToken } from './expo-push.sender';
import { FirebaseFcmSender } from './firebase-fcm.sender';
import { FcmSender, PushTokenGoneError } from './fcm-sender.interface';
import { RoutingPushSender } from './routing-push.sender';

const PAYLOAD = {
  title: 'Your Ayuvax health records are ready',
  body: 'Open Ayuva to see them',
  data: { type: 'report_ready', recordId: 'r1' },
};

const EXPO = 'ExponentPushToken[abc123]';

describe('isExpoPushToken', () => {
  it('recognises both Expo token spellings and nothing else', () => {
    expect(isExpoPushToken(EXPO)).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc]')).toBe(true);
    expect(isExpoPushToken('fcm-native-token:APA91b')).toBe(false);
  });
});

describe('RoutingPushSender', () => {
  const native = { send: jest.fn(), sendAndWake: jest.fn() };
  const expo = { send: jest.fn(), sendAndWake: jest.fn() };
  const sender = new RoutingPushSender(
    native as unknown as FcmSender,
    expo as unknown as FcmSender,
  );
  beforeEach(() => jest.clearAllMocks());

  it('sends Expo tokens to Expo', async () => {
    await sender.sendAndWake(EXPO, PAYLOAD);
    expect(expo.sendAndWake).toHaveBeenCalledWith(EXPO, PAYLOAD);
    expect(native.sendAndWake).not.toHaveBeenCalled();
  });

  it('sends native tokens to Firebase', async () => {
    await sender.send('native', PAYLOAD);
    expect(native.send).toHaveBeenCalledWith('native', PAYLOAD);
    expect(expo.send).not.toHaveBeenCalled();
  });
});

describe('FirebaseFcmSender', () => {
  const sender = new FirebaseFcmSender({} as App);
  beforeEach(() => send.mockReset().mockResolvedValue('id'));

  it('sends a data-only message that expo-notifications can show and hand to the app', async () => {
    await sender.sendAndWake('native', PAYLOAD);
    const message = send.mock.calls[0][0];
    expect(message.notification).toBeUndefined();
    expect(message.android).toEqual({ priority: 'high' });
    expect(message.data.title).toBe(PAYLOAD.title);
    expect(message.data.message).toBe(PAYLOAD.body);
    expect(JSON.parse(message.data.body)).toEqual(PAYLOAD.data);
  });

  it('keeps ordinary sends as visible notifications', async () => {
    await sender.send('native', PAYLOAD);
    expect(send.mock.calls[0][0].notification).toEqual({
      title: PAYLOAD.title,
      body: PAYLOAD.body,
    });
  });

  it('reports a dead token so the caller can forget it', async () => {
    send.mockRejectedValue({
      code: 'messaging/registration-token-not-registered',
    });
    await expect(sender.send('native', PAYLOAD)).rejects.toBeInstanceOf(
      PushTokenGoneError,
    );
  });
});

describe('ExpoPushSender', () => {
  const fetchMock = jest.fn();
  const original = global.fetch;
  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = original;
  });
  const reply = (data: unknown, ok = true, status = 200) =>
    fetchMock.mockResolvedValue({ ok, status, json: async () => ({ data }) });
  beforeEach(() => fetchMock.mockReset());

  it('asks Apple to wake the app only for wake sends', async () => {
    reply({ status: 'ok', id: 't1' });
    const sender = new ExpoPushSender();
    await sender.sendAndWake(EXPO, PAYLOAD);
    await sender.send(EXPO, PAYLOAD);
    const bodies = fetchMock.mock.calls.map((c) =>
      JSON.parse((c[1] as RequestInit).body as string),
    );
    expect(bodies[0]).toMatchObject({
      to: EXPO,
      title: PAYLOAD.title,
      data: PAYLOAD.data,
      contentAvailable: true,
    });
    expect(bodies[1].contentAvailable).toBeUndefined();
  });

  it('sends the access token when one is configured', async () => {
    reply({ status: 'ok', id: 't1' });
    await new ExpoPushSender('secret').send(EXPO, PAYLOAD);
    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret');
  });

  it('reports a device that has gone', async () => {
    reply({ status: 'error', details: { error: 'DeviceNotRegistered' } });
    await expect(
      new ExpoPushSender().send(EXPO, PAYLOAD),
    ).rejects.toBeInstanceOf(PushTokenGoneError);
  });

  it('fails on any other rejection or HTTP error', async () => {
    reply({ status: 'error', details: { error: 'MessageTooBig' } });
    await expect(new ExpoPushSender().send(EXPO, PAYLOAD)).rejects.toThrow(
      'MessageTooBig',
    );
    reply({}, false, 500);
    await expect(new ExpoPushSender().send(EXPO, PAYLOAD)).rejects.toThrow(
      'HTTP 500',
    );
  });
});
