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
  unsyncedCustomers: number;
  unsyncedHolds: number;
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
    unsyncedCustomers: 0,
    unsyncedHolds: 0,
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
      const [unsyncedSales, unsyncedCustomers, unsyncedHolds] = await Promise.all([
        offlineDB.countUnsyncedSales(),
        offlineDB.countUnsyncedCustomers(),
        offlineDB.countUnsyncedHolds(),
      ]);
      this.status.unsyncedSales = unsyncedSales;
      this.status.unsyncedCustomers = unsyncedCustomers;
      this.status.unsyncedHolds = unsyncedHolds;
      this.status.pendingCount = unsyncedSales + unsyncedCustomers + unsyncedHolds;
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
      // Customers first so temp ids remap before holds/sales POST.
      failed += await this.syncCustomers();
      failed += await this.syncHoldSales();
      failed += await this.syncSales();
      await this.pullFreshData();

      this.status.lastSync = Date.now();
      this.status.failedCount = failed;
      await this.refreshUnsyncedCount();

      console.log(
        failed
          ? `⚠️ Sync finished with ${failed} item(s) still pending`
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

        // Never replay dedicated flows here — they use their own tables.
        const url = String(request.url);
        if (
          url.includes('/sale') ||
          url.includes('/customer') ||
          url.includes('/hold')
        ) {
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

  /** @returns number of customers that failed to sync */
  private async syncCustomers(): Promise<number> {
    const pending = await offlineDB.getUnsyncedCustomers();
    if (!pending.length) return 0;
    console.log(`📤 Syncing ${pending.length} offline customers...`);

    let failed = 0;
    for (const row of pending) {
      try {
        const payload = {
          name: row.data?.name || row.name,
          phone_number: row.data?.phone_number || row.phone,
          email: row.data?.email || row.email || undefined,
          address: row.data?.address || undefined,
          default_discount_percent: row.data?.default_discount_percent,
          is_active: row.data?.is_active !== false,
        };

        const response = await apiClient.post('/customer', payload);
        const created =
          response?.data?.data?.customer ||
          response?.data?.data ||
          response?.data?.customer ||
          null;
        const realId = created?.id;
        if (!realId) {
          failed += 1;
          await offlineDB.markCustomerSyncFailed(row.id, 'Empty customer response');
          continue;
        }

        await offlineDB.remapCustomerId(row.id, String(realId), created);
        console.log('✅ Synced customer:', row.id, '→', realId);
      } catch (error: any) {
        const message =
          error?.response?.data?.message ||
          error?.message ||
          'Failed to sync customer';

        // Duplicate email/phone — try to find existing by phone and remap.
        if (
          String(message).toLowerCase().includes('already exists') ||
          error?.response?.status === 400
        ) {
          try {
            const phone = row.data?.phone_number || row.phone;
            if (phone) {
              const search = await apiClient.get('/customer', {
                params: { search: phone, limit: 5, page: 1 },
              });
              const list = Array.isArray(search?.data?.data) ? search.data.data : [];
              const match = list.find(
                (c: any) =>
                  String(c.phone_number || c.phone || '').replace(/\D/g, '') ===
                  String(phone).replace(/\D/g, ''),
              );
              if (match?.id) {
                await offlineDB.remapCustomerId(row.id, String(match.id), match);
                console.log('✅ Remapped offline customer to existing:', match.id);
                continue;
              }
            }
          } catch {
            /* fall through */
          }
        }

        failed += 1;
        console.error('❌ Failed to sync customer:', row.id, message);
        await offlineDB.markCustomerSyncFailed(row.id, String(message));
      }
    }
    return failed;
  }

  /** @returns number of holds that failed to sync */
  private async syncHoldSales(): Promise<number> {
    let failed = 0;

    const pendingDelete = await offlineDB.getPendingDeleteHoldSales();
    for (const hold of pendingDelete) {
      try {
        const serverId = hold.serverId || hold.id;
        await apiClient.delete(`/sale/hold/${serverId}`, {
          data: { branchId: hold.branchId },
        });
        await offlineDB.deleteHoldSaleLocal(hold.id);
      } catch (error: any) {
        if (error?.response?.status === 404) {
          await offlineDB.deleteHoldSaleLocal(hold.id);
          continue;
        }
        failed += 1;
        const message =
          error?.response?.data?.message || error?.message || 'Failed to delete hold';
        await offlineDB.markHoldSyncFailed(hold.id, String(message));
      }
    }

    const unsynced = await offlineDB.getUnsyncedHoldSales();
    if (!unsynced.length) return failed;
    console.log(`📤 Syncing ${unsynced.length} offline hold sales...`);

    for (const hold of unsynced) {
      try {
        // Wait for offline customer remap before attaching customerId.
        if (offlineDB.isOfflineCustomerId(hold.customerId)) {
          failed += 1;
          await offlineDB.markHoldSyncFailed(
            hold.id,
            'Waiting for offline customer sync',
          );
          continue;
        }

        const response = await apiClient.post('/sale/hold', {
          branchId: hold.branchId,
          customerId: hold.customerId || null,
          items: hold.items,
          clientHoldId: hold.clientHoldId,
        });
        const created = response?.data?.data;
        if (created?.id) {
          await offlineDB.markHoldSynced(hold.id, created);
          console.log('✅ Synced hold:', hold.clientHoldId);
        } else {
          failed += 1;
          await offlineDB.markHoldSyncFailed(hold.id, 'Empty hold response');
        }
      } catch (error: any) {
        failed += 1;
        const message =
          error?.response?.data?.message ||
          error?.message ||
          'Failed to sync hold';
        console.error('❌ Failed to sync hold:', hold.id, message);
        await offlineDB.markHoldSyncFailed(hold.id, String(message));
      }
    }
    return failed;
  }

  /** @returns number of sales that failed to sync */
  private async syncSales(): Promise<number> {
    const unsyncedSales = await offlineDB.getUnsyncedSales();
    if (!unsyncedSales.length) return 0;
    console.log(`📤 Syncing ${unsyncedSales.length} unsynced sales...`);

    let failed = 0;
    for (const sale of unsyncedSales) {
      try {
        const customerId = sale.customer?.id;
        if (offlineDB.isOfflineCustomerId(customerId)) {
          failed += 1;
          await offlineDB.markSaleSyncFailed(
            sale.id,
            'Waiting for offline customer sync',
          );
          continue;
        }

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
          customerId: customerId || undefined,
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
  return isNetworkFailure(error);
}

export function isNetworkFailure(error: unknown): boolean {
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
