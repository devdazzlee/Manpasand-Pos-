/**
 * Offline Sync Manager
 * Handles synchronization of offline data when connection is restored
 */

import { offlineDB } from './offline-db';
import apiClient from './apiClient';
import { API_BASE } from '@/config/constants';
import { getBranchScopeParam } from '@/lib/session';
import { collectPaginatedData } from './paginated-fetch';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSync: number;
  pendingCount: number;
  failedCount: number;
  unsyncedSales: number;
}

class OfflineSyncManager {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: ((status: SyncStatus) => void)[] = [];
  private status: SyncStatus = {
    isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    lastSync: 0,
    pendingCount: 0,
    failedCount: 0,
    unsyncedSales: 0,
  };

  private boundOnline = () => this.handleOnline();
  private boundOffline = () => this.handleOffline();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.boundOnline);
      window.addEventListener('offline', this.boundOffline);
      this.startPeriodicCheck();
      void this.refreshUnsyncedCount();
    }
  }

  private async refreshUnsyncedCount() {
    try {
      this.status.unsyncedSales = await offlineDB.countUnsyncedSales();
      this.notifyListeners();
    } catch {
      /* ignore */
    }
  }

  private handleOnline() {
    console.log('🌐 Connection restored - starting sync...');
    this.status.isOnline = true;
    this.notifyListeners();
    void this.syncAll();
  }

  private handleOffline() {
    console.log('📡 Connection lost - switching to offline mode');
    this.status.isOnline = false;
    this.notifyListeners();
  }

  private startPeriodicCheck() {
    this.syncInterval = setInterval(() => {
      if (this.status.isOnline && !this.status.isSyncing) {
        void this.syncAll();
      }
    }, 30000);
  }

  async syncAll() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (this.status.isSyncing || !this.status.isOnline || !token) {
      return;
    }

    this.status.isSyncing = true;
    this.notifyListeners();

    let failed = 0;
    try {
      await this.syncPendingRequests();
      failed += await this.syncSales();
      await this.pullFreshData();

      this.status.lastSync = Date.now();
      this.status.failedCount = failed;
      await this.refreshUnsyncedCount();
      this.status.pendingCount = this.status.unsyncedSales;

      console.log(
        failed
          ? `⚠️ Sync finished with ${failed} sale(s) still pending`
          : '✅ Sync completed successfully',
      );
    } catch (error) {
      console.error('❌ Sync failed:', error);
      this.status.failedCount++;
    } finally {
      this.status.isSyncing = false;
      this.notifyListeners();
    }
  }

  private async syncPendingRequests() {
    const pending = await offlineDB.getPendingRequests();
    if (!pending.length) return;
    console.log(`📤 Syncing ${pending.length} pending requests...`);

    for (const request of pending) {
      try {
        if (request.retries > 5) {
          console.warn(`⚠️ Dropping request after ${request.retries} retries:`, request.url);
          await offlineDB.removePendingRequest(request.id);
          continue;
        }

        // Never replay /sale here — sales use the dedicated sales table + clientSaleId.
        if (String(request.url).includes('/sale')) {
          await offlineDB.removePendingRequest(request.id);
          continue;
        }

        const token = localStorage.getItem('token');
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const absoluteUrl = /^https?:\/\//i.test(request.url)
          ? request.url
          : `${API_BASE.replace(/\/$/, '')}${request.url.startsWith('/') ? '' : '/'}${request.url}`;

        const response = await fetch(absoluteUrl, {
          method: request.method,
          headers: {
            'Content-Type': 'application/json',
            ...authHeader,
            ...request.headers,
          },
          body: request.body ? JSON.stringify(request.body) : undefined,
        });

        if (response.ok) {
          await offlineDB.removePendingRequest(request.id);
        } else {
          await offlineDB.incrementRetries(request.id);
        }
      } catch (error) {
        console.error('❌ Failed to sync request:', error);
        await offlineDB.incrementRetries(request.id);
      }
    }
  }

  /** @returns number of sales that failed to sync */
  private async syncSales(): Promise<number> {
    const unsyncedSales = await offlineDB.getUnsyncedSales();
    if (!unsyncedSales.length) return 0;
    console.log(`📤 Syncing ${unsyncedSales.length} unsynced sales...`);

    let failed = 0;
    for (const sale of unsyncedSales) {
      try {
        const clientSaleId = sale.clientSaleId || sale.id;
        const salePayload: Record<string, unknown> = {
          clientSaleId,
          items: (sale.products || []).map((item: any) => ({
            productId: item.productId || item.id,
            quantity: item.quantity,
            price: item.price,
          })),
          paymentMethod: sale.payment?.method || 'CASH',
          branchId: sale.branchId,
          customerId: sale.customer?.id,
          salespersonId: (sale as any).salespersonId || undefined,
          discountAmount: Number(sale.discountAmount) || 0,
          waiveBranchDiscount: sale.waiveBranchDiscount === true || undefined,
          applyPromotions: false,
        };

        const payments = sale.payment?.payments;
        if (Array.isArray(payments) && payments.length > 0) {
          salePayload.payments = payments;
        }

        const response = await apiClient.post('/sale', salePayload);

        if (response?.data?.data) {
          console.log('✅ Synced sale:', clientSaleId);
          await offlineDB.markSaleSynced(sale.id);
        } else {
          failed += 1;
          await offlineDB.markSaleSyncFailed(sale.id, 'Empty server response');
        }
      } catch (error: any) {
        failed += 1;
        const message =
          error?.response?.data?.message ||
          error?.message ||
          'Failed to sync sale';
        console.error('❌ Failed to sync sale:', sale.id, message);
        await offlineDB.markSaleSyncFailed(sale.id, String(message));
      }
    }
    return failed;
  }

  private async pullFreshData() {
    console.log('📥 Pulling fresh data from server...');

    try {
      // Same source New Sale uses — keeps offline catalog aligned with the till.
      const catalogRes = await apiClient.get('/products/pos-catalog', {
        params: { ...getBranchScopeParam() },
      });
      const productsArray = Array.isArray(catalogRes.data?.data) ? catalogRes.data.data : [];
      if (productsArray.length > 0) {
        await offlineDB.replaceProducts(productsArray);
        console.log(`✅ Updated ${productsArray.length} POS products`);
      } else {
        console.warn('No POS catalog returned');
      }

      const customersArray = await collectPaginatedData('/customer', {}, { limit: 100, maxPages: 50 });
      if (customersArray.length > 0) {
        await offlineDB.saveCustomers(customersArray);
        console.log(`✅ Updated ${customersArray.length} customers`);
      }

      await offlineDB.clearExpiredCache();
    } catch (error) {
      console.error('❌ Failed to pull fresh data:', error);
    }
  }

  subscribe(listener: (status: SyncStatus) => void) {
    this.listeners.push(listener);
    listener(this.status);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener({ ...this.status }));
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  async triggerSync() {
    if (this.status.isOnline) {
      await this.syncAll();
    } else {
      console.warn('⚠️ Cannot sync - no internet connection');
    }
  }

  canMakeRequest(): boolean {
    return this.status.isOnline;
  }

  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.boundOnline);
      window.removeEventListener('offline', this.boundOffline);
    }
  }
}

export const syncManager = new OfflineSyncManager();

export default syncManager;

/** True when the failure is connectivity/timeout — safe to queue offline. */
export function isNetworkSaleFailure(error: unknown): boolean {
  const err = error as {
    response?: unknown;
    code?: string;
    message?: string;
  } | null;
  if (!err) return true;
  if (err.response) return false;
  const code = String(err.code || '');
  if (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ERR_CANCELED'
  ) {
    return true;
  }
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('network') || msg.includes('timeout');
}
