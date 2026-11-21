/**
 * Initialize offline functionality
 * This should be called when the app starts
 */

'use client';

import { offlineDB } from './offline-db';
import { syncManager } from './offline-sync';
import { offlineAPIClient } from './offline-api-client';
import apiClient from './apiClient';
import { getBranchScopeParam } from '@/lib/session';
import { collectPaginatedData } from './paginated-fetch';

export async function initializeOfflineMode() {
  try {
    console.log('🔄 Initializing offline mode...');

    // Only initialize if user is logged in
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      console.log('⏭️ Skipping offline mode initialization (not logged in)');
      return true;
    }

    // Check if we have data in offline storage
    const stats = await offlineDB.getStats();
    console.log('📊 Offline storage stats:', stats);

    // If no data and we're online, fetch initial data
    if (stats.products === 0 && navigator.onLine) {
      console.log('📥 Fetching initial data for offline use...');
      await fetchInitialData();
    }

    // Start sync manager
    console.log('✅ Offline mode initialized');

    // If online, trigger sync
    if (navigator.onLine) {
      setTimeout(() => {
        syncManager.triggerSync();
      }, 2000);
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to initialize offline mode:', error);
    return false;
  }
}

async function fetchInitialData() {
  try {
    const catalogRes = await apiClient.get('/products/pos-catalog', {
      params: { ...getBranchScopeParam() },
    });
    const products = Array.isArray(catalogRes.data?.data) ? catalogRes.data.data : [];
    if (products.length > 0) {
      await offlineDB.replaceProducts(products);
      console.log(`✅ Cached ${products.length} POS products`);
    }

    const customers = await collectPaginatedData('/customer', {}, { limit: 100, maxPages: 50 });
    if (customers.length > 0) {
      await offlineDB.saveCustomers(customers);
      console.log(`✅ Cached ${customers.length} customers`);
    }
  } catch (error) {
    console.error('❌ Failed to fetch initial data:', error);
  }
}

export { offlineDB, syncManager, offlineAPIClient };


