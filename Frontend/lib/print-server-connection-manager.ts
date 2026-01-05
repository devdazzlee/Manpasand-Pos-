/**
 * Print Server Connection Manager
 * Proper connection state management to prevent stale connections
 * Implements connection lifecycle and state validation
 */

import { PRINT_API_BASE, PRINT_API_FALLBACK } from '@/config/constants';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'validated' | 'error';

interface ConnectionStateMachine {
  state: ConnectionState;
  lastValidation: number;
  connectionId: string | null;
  serverUrl: string | null;
}

class PrintServerConnectionManager {
  private state: ConnectionStateMachine = {
    state: 'disconnected',
    lastValidation: 0,
    connectionId: null,
    serverUrl: null,
  };

  private readonly VALIDATION_INTERVAL = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 5000; // 5 seconds
  private validationTimer: NodeJS.Timeout | null = null;

  private getLocalServerUrl(): string {
    return PRINT_API_BASE;
  }


  /**
   * Create a fresh HTTP request with proper connection handling
   * Uses unique connection identifier to prevent connection reuse
   */
  private async makeRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    // Generate unique connection ID to force fresh connection
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.CONNECTION_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        // Force new connection - prevent connection reuse
        cache: 'no-store',
        // Add unique headers to prevent connection pooling
        headers: {
          ...options.headers,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Connection-ID': connectionId,
        },
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Validate connection state - ensures connection is fresh and working
   */
  private async validateConnection(force: boolean = false): Promise<boolean> {
    const now = Date.now();
    const timeSinceLastValidation = now - this.state.lastValidation;

    // Skip validation if recently validated (unless forced)
    if (!force && timeSinceLastValidation < this.VALIDATION_INTERVAL && this.state.state === 'validated') {
      return true;
    }

    try {
      this.state.state = 'connecting';
      
      const healthUrl = `${this.getLocalServerUrl()}/health`;
      const response = await this.makeRequest(healthUrl, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data = await response.json();
      const isValid = data.status === 'ok';

      if (isValid) {
        this.state.state = 'validated';
        this.state.lastValidation = now;
        this.state.serverUrl = this.getLocalServerUrl();
        this.state.connectionId = `conn_${now}`;
        return true;
      }

      throw new Error('Health check returned invalid status');
    } catch (error) {
      this.state.state = 'error';
      this.state.serverUrl = null;
      this.state.connectionId = null;
      return false;
    }
  }

  /**
   * Initialize connection manager and start validation loop
   */
  async initialize(): Promise<void> {
    // Initial validation
    await this.validateConnection(true);

    // Set up periodic validation
    this.startValidationLoop();
  }

  /**
   * Start periodic connection validation
   */
  private startValidationLoop(): void {
    if (this.validationTimer) {
      clearInterval(this.validationTimer);
    }

    this.validationTimer = setInterval(async () => {
      // Only validate if we think we're connected
      if (this.state.state === 'validated' || this.state.state === 'connected') {
        await this.validateConnection(false);
      }
    }, this.VALIDATION_INTERVAL);
  }

  /**
   * Ensure connection is valid before operation
   * This is the key method - always validates before use
   */
  async ensureConnection(): Promise<{ available: boolean; url: string }> {
    // Always validate before use - this prevents stale connections
    const isValid = await this.validateConnection(true);

    if (isValid && this.state.serverUrl) {
      return {
        available: true,
        url: this.state.serverUrl,
      };
    }

    // Local server not available, use fallback
    return {
      available: false,
      url: this.getFallbackUrl(),
    };
  }

  /**
   * Reset connection state - use when connection fails
   */
  resetConnection(): void {
    this.state = {
      state: 'disconnected',
      lastValidation: 0,
      connectionId: null,
      serverUrl: null,
    };
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state.state;
  }

  /**
   * Get fallback URL (public method)
   */
  getFallbackUrl(): string {
    return PRINT_API_FALLBACK;
  }

  /**
   * Cleanup - stop validation loop
   */
  cleanup(): void {
    if (this.validationTimer) {
      clearInterval(this.validationTimer);
      this.validationTimer = null;
    }
    this.resetConnection();
  }
}

// Singleton instance
export const printServerConnectionManager = new PrintServerConnectionManager();

// Initialize on module load
if (typeof window !== 'undefined') {
  printServerConnectionManager.initialize().catch(console.error);
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    printServerConnectionManager.cleanup();
  });
}

