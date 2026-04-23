import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { VaultKeeperClient } from './client';
import type { VkProcessState, VkRuntimeStatus } from '../../shared/vaultkeeper';

interface VaultKeeperProcessManagerOptions {
  vkProjectRoot: string;
  vkWorkDir: string;
  port: number;
  healthCheckInterval?: number;
  startupTimeout?: number;
  maxRestarts?: number;
  onStateChange?: (status: VkRuntimeStatus) => void;
}

export class VaultKeeperProcessManager {
  private readonly vkProjectRoot: string;
  private readonly vkWorkDir: string;
  private readonly port: number;
  private readonly healthCheckInterval: number;
  private readonly startupTimeout: number;
  private readonly maxRestarts: number;
  private readonly onStateChange?: (status: VkRuntimeStatus) => void;

  private process: ChildProcess | null = null;
  private state: VkProcessState = 'stopped';
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private restartCount = 0;
  private startedAt: number | undefined;
  private client: VaultKeeperClient;

  constructor(options: VaultKeeperProcessManagerOptions) {
    this.vkProjectRoot = options.vkProjectRoot;
    this.vkWorkDir = options.vkWorkDir;
    this.port = options.port;
    this.healthCheckInterval = options.healthCheckInterval ?? 30_000;
    this.startupTimeout = options.startupTimeout ?? 30_000;
    this.maxRestarts = options.maxRestarts ?? 3;
    this.onStateChange = options.onStateChange;
    this.client = new VaultKeeperClient(`http://localhost:${this.port}`);
  }

  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      return;
    }

    this.setState('starting');

    // Check if port is available
    const portAvailable = await this.checkPortAvailable(this.port);
    if (!portAvailable) {
      this.setState('error');
      throw new Error(`Port ${this.port} is already in use`);
    }

    // Determine server entry point
    const serverEntry = path.join(this.vkProjectRoot, 'build', 'web', 'server.js');

    // Spawn the VaultKeeper server process
    this.process = spawn(process.execPath, [serverEntry], {
      cwd: this.vkWorkDir,
      env: {
        ...process.env,
        PORT: String(this.port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Log stdout with prefix
    if (this.process.stdout) {
      this.process.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString('utf-8').split('\n').filter(Boolean);
        for (const line of lines) {
          console.log(`[vaultkeeper] ${line}`);
        }
      });
    }

    // Log stderr with prefix
    if (this.process.stderr) {
      this.process.stderr.on('data', (chunk: Buffer) => {
        const lines = chunk.toString('utf-8').split('\n').filter(Boolean);
        for (const line of lines) {
          console.error(`[vaultkeeper] ${line}`);
        }
      });
    }

    // Handle unexpected exit
    this.process.on('exit', () => {
      this.handleUnexpectedExit();
    });

    // Wait for the server to become healthy
    try {
      await this.waitForHealthy(this.startupTimeout);
      this.startedAt = Date.now();
      this.restartCount = 0;
      this.setState('running');
      this.startHealthCheckLoop();
    } catch (err) {
      this.setState('error');
      // Clean up the process if it failed to start
      if (this.process && !this.process.killed) {
        this.process.kill('SIGKILL');
      }
      this.process = null;
      throw new Error(`VaultKeeper failed to start within ${this.startupTimeout}ms: ${(err as Error).message}`);
    }
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped') {
      return;
    }

    this.setState('stopping');
    this.stopHealthCheckLoop();

    if (this.process && !this.process.killed) {
      // Send SIGTERM first
      this.process.kill('SIGTERM');

      // Wait up to 5 seconds for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, 5_000);

        this.process!.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });

        // If process already exited, resolve immediately
        if (this.process!.killed || this.process!.exitCode !== null) {
          clearTimeout(timeout);
          resolve();
        }
      });

      // Force kill if still running
      if (this.process && !this.process.killed && this.process.exitCode === null) {
        this.process.kill('SIGKILL');
      }
    }

    this.process = null;
    this.startedAt = undefined;
    this.setState('stopped');
  }

  getState(): VkProcessState {
    return this.state;
  }

  getClient(): VaultKeeperClient {
    return this.client;
  }

  getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  getPid(): number | undefined {
    return this.process?.pid;
  }

  async getStatus(): Promise<VkRuntimeStatus> {
    const status: VkRuntimeStatus = {
      state: this.state,
      port: this.port,
      baseUrl: this.getBaseUrl(),
      pid: this.process?.pid,
      startedAt: this.startedAt,
    };

    // If running, fetch live info from health check
    if (this.state === 'running') {
      try {
        const health = await this.client.healthCheck();
        status.version = health.version;
        if (!health.ok) {
          status.error = health.error;
        }
      } catch {
        // Health check failed but process is still considered running
      }

      // Fetch tools info
      try {
        const toolsResponse = await this.client.getTools();
        status.tools = toolsResponse.data;
      } catch {
        // Ignore tools fetch failure
      }
    }

    return status;
  }

  // --- Private helpers ---

  private checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', () => {
        resolve(false);
      });

      server.once('listening', () => {
        server.close(() => {
          resolve(true);
        });
      });

      server.listen(port, '127.0.0.1');
    });
  }

  private waitForHealthy(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const pollInterval = 500;

      const timer = setInterval(async () => {
        const elapsed = Date.now() - startTime;

        if (elapsed >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('Health check timeout'));
          return;
        }

        // Check if process has exited
        if (this.process && this.process.exitCode !== null) {
          clearInterval(timer);
          reject(new Error(`Process exited prematurely with code ${this.process.exitCode}`));
          return;
        }

        try {
          const health = await this.client.healthCheck();
          if (health.ok) {
            clearInterval(timer);
            resolve();
          }
        } catch {
          // Not healthy yet, continue polling
        }
      }, pollInterval);
    });
  }

  private startHealthCheckLoop(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(async () => {
      if (this.state !== 'running') {
        this.stopHealthCheckLoop();
        return;
      }

      try {
        const health = await this.client.healthCheck();
        if (!health.ok) {
          console.warn(`[vaultkeeper] Health check failed: ${health.error}`);
        }
      } catch (err) {
        console.warn(`[vaultkeeper] Health check error: ${(err as Error).message}`);
      }
    }, this.healthCheckInterval);
  }

  private stopHealthCheckLoop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private handleUnexpectedExit(): void {
    const wasRunning = this.state === 'running';
    this.stopHealthCheckLoop();

    if (wasRunning && this.restartCount < this.maxRestarts) {
      this.restartCount++;
      console.warn(
        `[vaultkeeper] Process exited unexpectedly. Restarting (${this.restartCount}/${this.maxRestarts})...`,
      );

      this.setState('starting');

      // Delay before restarting (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, this.restartCount - 1), 10_000);
      setTimeout(async () => {
        try {
          await this.start();
        } catch (err) {
          console.error(`[vaultkeeper] Restart failed: ${(err as Error).message}`);
          this.setState('error');
        }
      }, delay);
    } else if (wasRunning) {
      console.error(
        `[vaultkeeper] Process exited unexpectedly and max restarts (${this.maxRestarts}) reached.`,
      );
      this.setState('error');
    } else {
      // Was not running (e.g., startup failure), just mark as stopped
      if (this.state === 'starting') {
        this.setState('error');
      } else {
        this.setState('stopped');
      }
    }
  }

  private setState(newState: VkProcessState): void {
    if (this.state === newState) {
      return;
    }

    const prevState = this.state;
    this.state = newState;

    console.log(`[vaultkeeper] State changed: ${prevState} -> ${newState}`);

    this.onStateChange?.({
      state: newState,
      port: this.port,
      baseUrl: this.getBaseUrl(),
      pid: this.process?.pid,
      startedAt: this.startedAt,
    });
  }
}
