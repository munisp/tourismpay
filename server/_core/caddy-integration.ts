import { ENV } from './env';
import { logger } from './logger';

/**
 * Caddy Integration Module
 *
 * Interfaces with Caddy's REST Admin API (port 2019) to dynamically
 * manage configuration, update routes, check certificate status, and reload.
 */

const CADDY_ADMIN_URL = (ENV as any).caddyAdminUrl || process.env.CADDY_ADMIN_URL || 'http://localhost:2019';

export interface CaddyConfig {
  admin?: {
    listen: string;
  };
  apps?: {
    http?: any;
    security?: any;
  };
  storage?: any;
}

export class CaddyClient {
  /**
   * Fetch the current full Caddy configuration.
   */
  static async getConfig(): Promise<CaddyConfig> {
    try {
      const response = await fetch(`${CADDY_ADMIN_URL}/config/`);
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }
      return (await response.json()) as CaddyConfig;
    } catch (error) {
      logger.error('Error fetching Caddy config', { error });
      throw error;
    }
  }

  /**
   * Update the entire Caddy configuration.
   */
  static async updateConfig(config: CaddyConfig): Promise<void> {
    try {
      const response = await fetch(`${CADDY_ADMIN_URL}/config/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        throw new Error(`Failed to update config: ${response.statusText}`);
      }
      logger.info('Caddy configuration updated successfully');
    } catch (error) {
      logger.error('Error updating Caddy config', { error });
      throw error;
    }
  }

  /**
   * Gracefully reload Caddy.
   */
  static async reload(): Promise<void> {
    try {
      const response = await fetch(`${CADDY_ADMIN_URL}/load`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(await this.getConfig()),
      });
      if (!response.ok) {
        throw new Error(`Failed to reload Caddy: ${response.statusText}`);
      }
      logger.info('Caddy reloaded successfully');
    } catch (error) {
      logger.error('Error reloading Caddy', { error });
      throw error;
    }
  }

  /**
   * Fetch Caddy metrics.
   */
  static async getMetrics(): Promise<string> {
    try {
      const response = await fetch(`${CADDY_ADMIN_URL}/metrics`);
      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      logger.error('Error fetching Caddy metrics', { error });
      throw error;
    }
  }
}
