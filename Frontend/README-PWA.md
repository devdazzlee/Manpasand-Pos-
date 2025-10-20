# 🚀 MANPASAND POS - Progressive Web App

Your POS system is now installable on desktop and mobile devices!

## Quick Start

### 1️⃣ Build the PWA

```bash
cd Frontend
yarn build
```

### 2️⃣ Test Locally

```bash
yarn serve
```

Visit `http://localhost:3000` and test the installation.

### 3️⃣ Deploy

Upload the `out` folder to any hosting service:
- **Netlify**: Drag & drop
- **Vercel**: Connect GitHub
- **GitHub Pages**: Upload to gh-pages
- **Any web server**: Upload contents

---

## 📱 How to Install

### Desktop (Chrome/Edge/Brave)
1. Visit your website
2. Click install icon (⊕) in address bar
3. Click "Install"

### Android
1. Open in Chrome
2. Menu (⋮) → "Install app"
3. Tap "Install"

### iOS (Safari)
1. Share button (□↑)
2. "Add to Home Screen"
3. Tap "Add"

---

## ✨ What's Included

✅ **Offline Support** - Works without internet  
✅ **Fast Loading** - Cached for instant access  
✅ **App-Like** - Full screen experience  
✅ **Auto-Updates** - Updates automatically  
✅ **All Platforms** - Desktop + Mobile  

---

## 🛠️ Useful Commands

```bash
# Start development (PWA disabled)
yarn dev

# Build for production
yarn build

# Serve built PWA locally
yarn serve

# Regenerate icons from logo.png
yarn generate-icons

# Build and serve in one command
yarn build:pwa
```

---

## 📊 Test Your PWA

1. Open Chrome DevTools (F12)
2. Go to "Lighthouse" tab
3. Run "Progressive Web App" audit
4. Should score 90+ points!

---

## 🎨 Customize

### Change App Name
Edit `public/manifest.json`:
```json
{
  "name": "Your App Name",
  "short_name": "Short Name"
}
```

### Change Colors
Edit `public/manifest.json`:
```json
{
  "theme_color": "#your-color",
  "background_color": "#your-bg-color"
}
```

### Update Icons
Replace `public/logo.png` with your logo, then:
```bash
yarn generate-icons
```

---

## 📁 File Structure

```
Frontend/
├── public/
│   ├── manifest.json        # PWA manifest
│   ├── offline.html         # Offline fallback page
│   ├── icons/               # App icons (all sizes)
│   └── sw.js               # Service worker (auto-generated)
├── app/
│   └── layout.tsx           # PWA metadata
├── next.config.mjs          # PWA configuration
└── generate-pwa-icons.js   # Icon generator script
```

---

## 🌐 Browser Support

| Platform | Chrome | Edge | Safari | Firefox | Opera |
|----------|--------|------|--------|---------|-------|
| Desktop  | ✅     | ✅   | ⚠️     | ✅      | ✅    |
| Mobile   | ✅     | ✅   | ⚠️     | ✅      | ✅    |

✅ Full support | ⚠️ Limited support

---

## 🐛 Troubleshooting

**Install button not showing?**
- Use HTTPS (required for PWA)
- Check DevTools → Application → Service Workers
- Clear cache and reload

**Not working offline?**
- Visit pages while online first
- Check DevTools → Application → Cache Storage
- Verify service worker is active

**iOS issues?**
- Must use Safari
- Some features limited on iOS
- Push notifications don't work

---

## 📚 More Info

See [PWA-GUIDE.md](./PWA-GUIDE.md) for detailed documentation.

---

**Need help?** Check the [PWA-GUIDE.md](./PWA-GUIDE.md) for comprehensive documentation!

🎉 **Happy Installing!**

