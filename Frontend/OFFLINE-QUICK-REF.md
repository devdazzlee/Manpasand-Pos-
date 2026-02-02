# ⚡ Offline-First Quick Reference

## 🚀 Your App Works Offline!

**When internet stops → App keeps working → Data syncs when back online**

---

## 📝 Quick Usage

### Make API Call (Works Offline)

```typescript
import { offlineAPIClient } from '@/lib/offline-api-client';

// Automatic offline handling!
const result = await offlineAPIClient.post('/api/v1/sales', data);
```

### Search Products (Offline Database)

```typescript
import { offlineDB } from '@/lib/offline-db';

const products = await offlineDB.searchProducts('shoes');
const all = await offlineDB.getProducts();
```

### Show Online Status

```typescript
import { useOnlineStatus } from '@/hooks/use-offline';

const status = useOnlineStatus();
// status.isOnline: boolean
// status.isSyncing: boolean
// status.pendingCount: number
```

### Manual Sync

```typescript
import { useSync } from '@/hooks/use-offline';

const { sync, isSyncing } = useSync();
await sync(); // Trigger sync manually
```

---

## 🎯 Key Features

✅ **Full offline functionality**  
✅ **Automatic sync when online**  
✅ **Local database (IndexedDB)**  
✅ **Request queuing**  
✅ **Visual status indicator**  
✅ **Zero data loss**  

---

## 📊 UI Indicator

**Bottom-right corner of app:**
- 🟢 Online
- 🔴 Offline  
- 🔄 Syncing
- Click for details

---

## 🧪 Test Offline

**Chrome:**
F12 → Network → Offline

**Real:**
Build → Serve → Turn off WiFi

---

## 📚 Full Docs

- [OFFLINE-FIRST-GUIDE.md](OFFLINE-FIRST-GUIDE.md) - Complete guide
- [OFFLINE-COMPLETE-SUMMARY.md](../OFFLINE-COMPLETE-SUMMARY.md) - Summary

---

## ✅ Deploy

```bash
yarn build  # Builds with offline support
yarn serve  # Test locally
```

**Deploy `out` folder to any hosting!**

---

**Your POS never stops working! 🎉**


