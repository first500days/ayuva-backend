import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { PartnerStowService } from './partner-stow.service';
import { MAX_STOW_BYTES, StowController } from './stow.controller';
import { dicomFile } from './test-dicom';

const BOUNDARY = 'DICOMwebBoundary';
const multipart = (...files: Buffer[]) =>
  Buffer.concat([
    ...files.flatMap((f) => [
      Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
      f,
      Buffer.from('\r\n'),
    ]),
    Buffer.from(`--${BOUNDARY}--\r\n`),
  ]);
const TYPE = `multipart/related; type="application/dicom"; boundary=${BOUNDARY}`;

describe('StowController over HTTP', () => {
  let app: INestApplication;
  const stow = {
    gateway: jest.fn(),
    store: jest.fn(),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }])],
      controllers: [StowController],
      providers: [{ provide: PartnerStowService, useValue: stow }],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    stow.gateway.mockResolvedValue({ a: {}, provider: {} });
    stow.store.mockImplementation(async (_g, parts: { body: Buffer }[]) => ({
      stored: parts.map((_, i) => ({ sopClassUid: '1.2', sopInstanceUid: `9.${i}` })),
      failed: [],
    }));
  });

  it('stores the images and answers in DICOM JSON', async () => {
    const res = await request(app.getHttpServer())
      .post('/dicomweb-ingest/studies')
      .set('x-analyser-key', 'ayk_x')
      .set('Content-Type', TYPE)
      .send(multipart(dicomFile({ sop: 'a' }), dicomFile({ sop: 'b' })));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/dicom+json');
    expect(JSON.parse(res.text)['00081199'].Value).toHaveLength(2);
    const parts = stow.store.mock.calls[0][1] as { body: Buffer }[];
    expect(parts[0].body.subarray(128, 132).toString()).toBe('DICM');
  });

  it('accepts the key as a bearer token, and the study-level path', async () => {
    const res = await request(app.getHttpServer())
      .post('/dicomweb-ingest/studies/1.2.3')
      .set('Authorization', 'Bearer ayk_bearer')
      .set('Content-Type', TYPE)
      .send(multipart(dicomFile({})));
    expect(res.status).toBe(200);
    expect(stow.gateway).toHaveBeenCalledWith('ayk_bearer');
  });

  it('checks the key before reading anything', async () => {
    stow.gateway.mockRejectedValue(new UnauthorizedException('Unknown or switched-off gateway'));
    const res = await request(app.getHttpServer())
      .post('/dicomweb-ingest/studies')
      .set('Content-Type', TYPE)
      .send(multipart(dicomFile({})));
    expect(res.status).toBe(401);
    expect(stow.store).not.toHaveBeenCalled();
  });

  it('refuses a request that is not multipart/related', async () => {
    const res = await request(app.getHttpServer())
      .post('/dicomweb-ingest/studies')
      .set('x-analyser-key', 'ayk_x')
      .set('Content-Type', 'application/dicom')
      .send(dicomFile({}));
    expect(res.status).toBe(415);
  });

  it('refuses an oversized request by its declared length', async () => {
    const res = await request(app.getHttpServer())
      .post('/dicomweb-ingest/studies')
      .set('x-analyser-key', 'ayk_x')
      .set('Content-Type', TYPE)
      .set('Content-Length', String(MAX_STOW_BYTES + 1))
      .send('x');
    expect(res.status).toBe(413);
    expect(stow.store).not.toHaveBeenCalled();
  });

  it('answers 202 when some images were refused, 409 when all were', async () => {
    stow.store.mockResolvedValueOnce({
      stored: [{ sopClassUid: '1', sopInstanceUid: '2' }],
      failed: [{ sopClassUid: '1', sopInstanceUid: '3', reason: 0x0110 }],
    });
    const partial = await request(app.getHttpServer())
      .post('/dicomweb-ingest/studies')
      .set('x-analyser-key', 'ayk_x')
      .set('Content-Type', TYPE)
      .send(multipart(dicomFile({})));
    expect(partial.status).toBe(202);
    expect(JSON.parse(partial.text)['00081198'].Value[0]['00081197'].Value).toEqual([0x0110]);

    stow.store.mockResolvedValueOnce({
      stored: [],
      failed: [{ sopClassUid: '1', sopInstanceUid: '3', reason: 0x0110 }],
    });
    const none = await request(app.getHttpServer())
      .post('/dicomweb-ingest/studies')
      .set('x-analyser-key', 'ayk_x')
      .set('Content-Type', TYPE)
      .send(multipart(dicomFile({})));
    expect(none.status).toBe(409);
  });
});
