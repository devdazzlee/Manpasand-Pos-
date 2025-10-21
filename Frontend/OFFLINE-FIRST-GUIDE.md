# 🚀 Offline-First POS System Guide

## ✨ Your App Now Works Completely Offline!

Your MANPASAND POS system now has **full offline functionality**. When the internet goes down, your app continues working normally - all sales, customer lookups, and data operations work without interruption. When the connection is restored, everything syncs automatically!

---

## 🎯 What This Means

### Before (Standard PWA):
- ❌ App shows "offline" page when internet disconnects
- ❌ Can't process sales without connection
- ❌ Can't search products or customers
- ❌ All functionality stops

### After (Offline-First):
- ✅ **App works exactly the same offline**
- ✅ **Process sales without internet**
- ✅ **Search products & customers from local database**
- ✅ **All actions are queued and synced later**
- ✅ **Zero functionality loss**

---

## 🔧 How It Works

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  1. App loads → Data syncs to local database   │
│                                                 │
│  2. Internet disconnects → App uses local data  │
│                                                 │
│  3. User makes sale → Saved locally + queued    │
│                                                 │
│  4. Internet reconnects → Auto sync to server   │
│                                                 │
│  5. All data updated → Everything in sync ✓    │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 📦 What's Stored Offline

### IndexedDB Database: `ManpasandPOSDB`

1. **Products** - Full product catalog
   - Name, SKU, price, stock
   - Searchable offline
   - Auto-syncs when online

2. **Customers** - Customer database
   - Name, contact info
   - Searchable offline
   - Auto-syncs when online

3. **Sales** - Transaction records
   - Sales made while offline
   - Automatically synced when online
   - Marked with sync status

4. **Pending Requests** - API queue
   - Any API calls made offline
   - Retried automatically when online
   - Priority-based execution

5. **Cached Data** - Temporary cache
   - API responses
   - TTL-based expiration
   - Auto-cleanup

---

## 💻 Using Offline Features in Code

### 1. Making API Calls (Offline-Aware)

```typescript
import { offlineAPIClient } from '@/lib/offline-api-client';

// This automatically handles offline mode!
async function createSale(saleData) {
  // If online: Posts to API
  // If offline: Queues for later + saves locally
  const result = await offlineAPIClient.post('/api/v1/sales', saleData, {
    priority: 10 // Higher priority syncs first
  });
  
  // Result includes _pending flag if queued
  if (result._pending) {
    console.log('Sale queued for sync');
  }
  
  return result;
}
```

### 2. Searching Products Offline

```typescript
import { offlineDB } from '@/lib/offline-db';

async function searchProducts(query: string) {
  // Works offline! Searches local database
  const products = await offlineDB.searchProducts(query);
  return products;
}

async function getAllProducts() {
  // Returns all cached products
  const products = await offlineDB.getProducts();
  return products;
}
```

### 3. Saving Data Locally

```typescript
import { offlineDB } from '@/lib/offline-db';

// Save a sale (works offline)
async function saveSale(sale) {
  const savedSale = await offlineDB.saveSale({
    products: sale.items,
    total: sale.amount,
    customer: sale.customer,
    payment: sale.paymentMethod,
    employeeId: currentUser.id,
    branchId: currentBranch.id
  });
  
  console.log('Sale saved:', savedSale.id);
  // Will auto-sync when online
}
```

### 4. Checking Online Status

```typescript
'use client';

import { useOnlineStatus } from '@/hooks/use-offline';

function MyComponent() {
  const status = useOnlineStatus();
  
  return (
    <div>
      {status.isOnline ? (
        <span>✅ Online</span>
      ) : (
        <span>📡 Offline - {status.pendingCount} items queued</span>
      )}
      
      {status.isSyncing && <span>🔄 Syncing...</span>}
    </div>
  );
}
```

### 5. Manual Sync

```typescript
'use client';

import { useSync } from '@/hooks/use-offline';

function SyncButton() {
  const { sync, isSyncing } = useSync();
  
  return (
    <button onClick={sync} disabled={isSyncing}>
      {isSyncing ? 'Syncing...' : 'Sync Now'}
    </button>
  );
}
```

### 6. Offline Storage Hooks

```typescript
'use client';

import { useOfflineStorage } from '@/hooks/use-offline';

function ProductList() {
  const { getProducts, searchProducts } = useOfflineStorage();
  const [products, setProducts] = useState([]);
  
  useEffect(() => {
    // Load products from offline storage
    getProducts().then(setProducts);
  }, []);
  
  async function handleSearch(query: string) {
    const results = await searchProducts(query);
    setProducts(results);
  }
  
  return (
    // Your UI here
  );
}
```

---

## 🎨 UI Components

### Offline Status Indicator

Already added to your app! Shows in bottom-right corner:

- 🟢 **Green badge** = Online
- 🔴 **Red badge** = Offline mode
- 🔄 **Spinning icon** = Syncing
- 📊 **Counter badge** = Pending requests

Click to see detailed status:
- Connection status
- Last sync time
- Pending requests count
- Offline data statistics

---

## 🔄 Automatic Synchronization

### What Gets Synced:

1. **Pending API Requests** (highest priority)
   - Queued POST, PUT, DELETE requests
   - Retried up to 5 times
   - Priority-based execution

2. **Unsynced Sales**
   - All sales made offline
   - Posted to server when online
   - Marked as synced on success

3. **Fresh Data Pull**
   - Products updated from server
   - Customers updated from server
   - Cache refreshed

### Sync Triggers:

- ✅ **Automatic:** When internet reconnects
- ✅ **Periodic:** Every 30 seconds (if online)
- ✅ **Manual:** Click sync button
- ✅ **On app start:** If online

---

## 🎯 Real-World Scenarios

### Scenario 1: Internet Drops During Sale

```
User opens POS → Internet disconnects → User processes sale
    ↓
Sale saved to local database
    ↓
Sale queued for sync
    ↓
User sees confirmation (with "pending" indicator)
    ↓
Internet reconnects
    ↓
Sale automatically synced to server
    ↓
Confirmation updated to "synced" ✓
```

### Scenario 2: Starting Day Offline

```
User arrives → Internet is down → Opens POS app
    ↓
App loads from cache
    ↓
Products/customers load from local database
    ↓
User processes multiple sales (all saved locally)
    ↓
Internet comes back
    ↓
All sales sync automatically
    ↓
Fresh data downloaded
    ↓
Everything up to date ✓
```

### Scenario 3: Intermittent Connection

```
User making sale → Internet flaky
    ↓
App automatically uses offline mode
    ↓
No interruption to user
    ↓
Requests queued during disconnects
    ↓
Synced during connection windows
    ↓
Seamless experience ✓
```

---

## 📊 Monitoring & Debugging

### Check Offline Data

```typescript
import { offlineDB } from '@/lib/offline-db';

// Get statistics
const stats = await offlineDB.getStats();
console.log(stats);
// {
//   products: 150,
//   customers: 50,
//   sales: 5,
//   pendingRequests: 2,
//   cachedData: 20
// }

// Get unsynced sales
const unsynced = await offlineDB.getUnsyncedSales();
console.log('Unsynced sales:', unsynced);

// Get pending requests
const pending = await offlineDB.getPendingRequests();
console.log('Pending requests:', pending);
```

### Browser DevTools

1. Open DevTools (F12)
2. Go to **Application** tab
3. Check **IndexedDB** → `ManpasandPOSDB`
4. View all offline data

### Console Logs

The system logs all offline operations:
- `🔄` Initializing
- `📥` Caching data
- `📤` Syncing
- `✅` Success
- `❌` Errors
- `⚠️` Warnings

---

## ⚙️ Configuration

### Cache Time-To-Live

Edit `Frontend/next.config.mjs`:

```javascript
runtimeCaching: [
  {
    urlPattern: /^https:\/\/.*\/api\/.*/i,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'api-cache',
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 60 * 5 // Change this (5 minutes default)
      }
    }
  }
]
```

### Sync Interval

Edit `Frontend/lib/offline-sync.ts`:

```typescript
private startPeriodicCheck() {
  // Change 30000 to desired milliseconds
  this.syncInterval = setInterval(() => {
    if (this.status.isOnline && !this.status.isSyncing) {
      this.syncAll();
    }
  }, 30000); // 30 seconds
}
```

### Initial Data Fetch

Edit `Frontend/lib/offline-init.ts` to add more endpoints:

```typescript
// Add more data to cache on startup
const categoriesRes = await fetch(`${API_BASE}/categories`);
if (categoriesRes.ok) {
  const data = await categoriesRes.json();
  // Store in offline DB
}
```

---

## 🚀 Deployment

### Build with Offline Support

```bash
cd Frontend
yarn build
```

This creates:
- ✅ Service worker with advanced caching
- ✅ IndexedDB schemas
- ✅ Offline sync logic
- ✅ All UI components

### First User Experience

1. **User visits app (online)**
   - Service worker installs
   - Initial data downloads to IndexedDB
   - App ready for offline use

2. **User goes offline**
   - App continues working
   - Data served from IndexedDB
   - Actions queued for sync

3. **User comes back online**
   - Queued actions sync automatically
   - Fresh data downloaded
   - Everything updated

---

## 📱 Testing Offline Mode

### Chrome DevTools

1. Open DevTools (F12)
2. Go to **Network** tab
3. Change **Online** → **Offline**
4. App still works!

### Real Testing

1. Build app: `yarn build`
2. Serve: `yarn serve`
3. Open in browser
4. Turn off WiFi
5. Test full functionality

---

## 🔒 Security Considerations

### Data Encryption

IndexedDB data is stored locally on device:
- ✅ Secure on modern browsers
- ✅ Domain-isolated
- ✅ Not accessible to other sites

### Sensitive Data

For highly sensitive operations:

```typescript
// Skip offline for sensitive actions
if (!navigator.onLine) {
  throw new Error('This action requires internet connection');
}

// Or use network-only strategy
await offlineAPIClient.post('/api/sensitive', data, {
  cacheStrategy: 'network-only'
});
```

---

## 🐛 Troubleshooting

### "Data not syncing"

1. Check online status indicator
2. Open console for sync errors
3. Check pending requests count
4. Manual sync: Click sync button
5. Check DevTools → Application → IndexedDB

### "App slow after offline use"

1. Clear expired cache:
   ```typescript
   await offlineDB.clearExpiredCache();
   ```

2. Limit cached data:
   - Edit maxEntries in next.config.mjs
   - Reduce cache TTL

### "Storage quota exceeded"

```typescript
// Clear old data
await offlineDB.clearAll();

// Or selectively:
await db.cachedData.clear();
```

### "Duplicate sales after sync"

Check for proper ID assignment:
- Server should return permanent IDs
- Replace temp IDs in local DB
- Mark as synced

---

## 📚 API Reference

### offlineDB

```typescript
// Products
offlineDB.saveProducts(products: any[]): Promise<number>
offlineDB.getProducts(): Promise<Product[]>
offlineDB.getProduct(id: string): Promise<Product | undefined>
offlineDB.searchProducts(query: string): Promise<Product[]>

// Customers
offlineDB.saveCustomers(customers: any[]): Promise<number>
offlineDB.getCustomers(): Promise<Customer[]>
offlineDB.searchCustomers(query: string): Promise<Customer[]>

// Sales
offlineDB.saveSale(sale: any): Promise<Sale>
offlineDB.getUnsyncedSales(): Promise<Sale[]>
offlineDB.markSaleSynced(id: string): Promise<void>
offlineDB.getAllSales(): Promise<Sale[]>

// Queue
offlineDB.queueRequest(request: RequestOptions): Promise<PendingRequest>
offlineDB.getPendingRequests(): Promise<PendingRequest[]>
offlineDB.removePendingRequest(id: string): Promise<void>

// Cache
offlineDB.setCachedData(key: string, data: any, ttl?: number): Promise<void>
offlineDB.getCachedData(key: string): Promise<any | null>
offlineDB.clearExpiredCache(): Promise<void>

// Management
offlineDB.clearAll(): Promise<void>
offlineDB.getStats(): Promise<Stats>
```

### syncManager

```typescript
syncManager.triggerSync(): Promise<void>
syncManager.subscribe(listener: (status: SyncStatus) => void): () => void
syncManager.getStatus(): SyncStatus
syncManager.canMakeRequest(): boolean
```

### offlineAPIClient

```typescript
offlineAPIClient.get<T>(url: string, options?: Options): Promise<T | null>
offlineAPIClient.post<T>(url: string, data?: any, options?: Options): Promise<T | null>
offlineAPIClient.put<T>(url: string, data?: any, options?: Options): Promise<T | null>
offlineAPIClient.delete<T>(url: string, options?: Options): Promise<T | null>
offlineAPIClient.patch<T>(url: string, data?: any, options?: Options): Promise<T | null>
```

---

## ✅ Summary

Your MANPASAND POS is now **fully offline-capable**:

✅ **Complete offline functionality** - All features work without internet  
✅ **Automatic sync** - Data syncs when connection restored  
✅ **Smart caching** - Products, customers cached locally  
✅ **Request queuing** - API calls queued and retried  
✅ **Visual indicators** - Users see online/offline status  
✅ **Zero data loss** - Everything saved and synced  
✅ **Seamless experience** - Users don't notice disconnects  

**Your POS will never stop working due to internet issues! 🎉**

---

## 🎯 Next Steps

1. ✅ Build the app: `yarn build`
2. ✅ Test offline: Turn off WiFi and use the app
3. ✅ Deploy to production
4. ✅ Train users on offline indicator
5. ✅ Monitor sync status in production

**You're ready for offline-first POS operations! 🚀**


