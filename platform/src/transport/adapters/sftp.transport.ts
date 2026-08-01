import { Injectable } from '@nestjs/common';
import { TransportRegistry } from '../transport-registry';
import { TransportAdapter, TransportDescriptor, TransportInstance, TransportPayload, TransportNotConfiguredError } from '../transport.types';

/** SFTP endpoint config (non-secret; the private key / password live in the vault via `vaultRef`). */
export interface SftpSettings {
  host: string;
  port?: number; // default 22
  username: string;
  /** Directory to list+get on pull. */
  inboundPath?: string;
  /** Directory to put on push. */
  outboundPath?: string;
  /** Glob to filter inbound files (e.g. '*.csv'). */
  pattern?: string;
}

/**
 * SFTP transport — STUB. The descriptor + config surface are real (so the console can offer it and an
 * onboarding flow can collect host/user/key), but pull/push refuse to run without live credentials
 * and an SFTP client (ssh2-sftp-client) we can't exercise here. It validates config so a misconfigured
 * endpoint fails loudly at setup, not silently at runtime.
 */
@Injectable()
export class SftpTransport implements TransportAdapter {
  readonly type = 'sftp';

  constructor(registry: TransportRegistry) {
    registry.register(this);
  }

  descriptor(): TransportDescriptor {
    return { id: 'sftp', kind: 'transport', name: 'SFTP', description: 'Fetch/deliver files over SFTP', mode: 'poll+push' };
  }

  async pull(instance: TransportInstance): Promise<TransportPayload[]> {
    this.requireConfig(instance);
    throw new TransportNotConfiguredError('sftp', 'live fetch needs an SFTP client + vault credentials (deferred to a credentialed environment)');
  }

  async push(_payload: TransportPayload, instance: TransportInstance): Promise<void> {
    this.requireConfig(instance);
    throw new TransportNotConfiguredError('sftp', 'live delivery needs an SFTP client + vault credentials (deferred to a credentialed environment)');
  }

  /** Fail loudly on a misconfigured endpoint (missing host/username) before any I/O is attempted. */
  private requireConfig(instance: TransportInstance): void {
    const s = (instance.settings ?? {}) as unknown as SftpSettings;
    const missing = (['host', 'username'] as const).filter((k) => !s[k]);
    if (missing.length) throw new Error(`sftp transport misconfigured: missing ${missing.join(', ')}`);
    if (!instance.vaultRef) throw new Error('sftp transport misconfigured: missing vaultRef for credentials');
  }
}
