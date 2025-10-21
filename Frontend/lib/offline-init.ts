/**
 * Initialize offline functionality
 * This should be called when the app starts
 */

'use client';

import { offlineDB } from './offline-db';
import { syncManager } from './offline-sync';
import { offlineAPIClient } from './offline-api-client';

export async function initializeOfflineMode() {
  try {
    console.log('🔄 Initializing offline mode...');

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
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

    // Fetch products
    try {
      const productsRes = await fetch(`${API_BASE}/products`);
      if (productsRes.ok) {
        const productsData = await productsRes.json();
        if (productsData.data) {
          await offlineDB.saveProducts(productsData.data);
          console.log(`✅ Cached ${productsData.data.length} products`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch products:', error);
    }

    // Fetch customers
    try {
      const customersRes = await fetch(`${API_BASE}/customers`);
      if (customersRes.ok) {
        const customersData = await customersRes.json();
        if (customersData.data) {
          await offlineDB.saveCustomers(customersData.data);
          console.log(`✅ Cached ${customersData.data.length} customers`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch customers:', error);
    }

    // Fetch other critical data as needed
    // Add more fetch calls here for categories, branches, etc.

  } catch (error) {
    console.error('❌ Failed to fetch initial data:', error);
  }
}

export { offlineDB, syncManager, offlineAPIClient };


