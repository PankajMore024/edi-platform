import { Test } from '@nestjs/testing';
import { TransportModule } from './transport.module';
import { TransportRegistry } from './transport-registry';
import { SftpTransport } from './adapters/sftp.transport';
import { WebhookTransport } from './adapters/webhook.transport';
import { TransportInstance } from './transport.types';

const sftpInstance = (over: Partial<TransportInstance> = {}): TransportInstance => ({
  id: 'tp-sftp', tenantId: 't1', transportType: 'sftp',
  settings: { host: 'sftp.partner.com', username: 'edi' }, vaultRef: 'vault://sftp/1', direction: 'both', ...over,
});
const webhookInstance = (over: Partial<TransportInstance> = {}): TransportInstance => ({
  id: 'tp-wh', tenantId: 't1', transportType: 'webhook', settings: {}, direction: 'inbound', ...over,
});

describe('Transport layer', () => {
  it('DI: both transports self-register into the registry under distinct types', async () => {
    const mod = await Test.createTestingModule({ imports: [TransportModule] }).compile();
    const reg = mod.get(TransportRegistry);
    const ids = reg.list().map((d) => d.id).sort();
    expect(ids).toEqual(['sftp', 'webhook']);
    expect(reg.list().every((d) => d.kind === 'transport')).toBe(true);
    await mod.close();
  });

  describe('SFTP (stub)', () => {
    const t = () => new SftpTransport(new TransportRegistry());

    it('validates config, then refuses to run live without credentials', async () => {
      await expect(t().pull(sftpInstance())).rejects.toThrow(/not live yet/);
      await expect(t().push({ bytes: 'x', source: 's' }, sftpInstance())).rejects.toThrow(/not live yet/);
    });

    it('fails loudly on misconfiguration (missing host / vaultRef) before any I/O', async () => {
      await expect(t().pull(sftpInstance({ settings: { username: 'edi' } }))).rejects.toThrow(/missing host/);
      await expect(t().pull(sftpInstance({ vaultRef: undefined }))).rejects.toThrow(/missing vaultRef/);
    });
  });

  describe('Webhook', () => {
    const t = () => new WebhookTransport(new TransportRegistry());

    it('is push-based: pull is invalid', async () => {
      await expect(t().pull(webhookInstance())).rejects.toThrow(/push-based/);
    });

    it('receive() shapes an inbound delivery into a payload (no signature configured)', () => {
      const payload = t().receive({ body: '{"po":"1"}', headers: {}, deliveryId: 'd-99' }, webhookInstance());
      expect(payload).toEqual({ bytes: '{"po":"1"}', source: 'webhook:webhook:d-99' });
    });

    it('rejects an inbound delivery when a signature is required but absent (financial safety)', () => {
      const inst = webhookInstance({ settings: { signatureScheme: 'hmac-sha256', signatureHeader: 'X-Sig' }, vaultRef: 'vault://wh/1' });
      expect(() => t().receive({ body: 'x', headers: {} }, inst)).toThrow(/signature header "X-Sig" is absent/);
    });

    it('accepts a signed delivery (verification against the secret is deferred)', () => {
      const inst = webhookInstance({ settings: { signatureScheme: 'hmac-sha256', signatureHeader: 'X-Sig' }, vaultRef: 'vault://wh/1' });
      const payload = t().receive({ body: 'x', headers: { 'X-Sig': 'abc' }, deliveryId: 'd-1' }, inst);
      expect(payload.bytes).toBe('x');
    });

    it('outbound push requires a url and then defers to a credentialed environment', async () => {
      await expect(t().push({ bytes: 'x', source: 's' }, webhookInstance())).rejects.toThrow(/missing outbound url/);
      await expect(t().push({ bytes: 'x', source: 's' }, webhookInstance({ settings: { url: 'https://p/hook' } }))).rejects.toThrow(/not live yet/);
    });
  });
});
