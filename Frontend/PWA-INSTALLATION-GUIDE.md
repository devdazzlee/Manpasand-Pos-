# 📱 PWA Installation Components

Beautiful, customizable Progressive Web App installation prompts for MANPASAND POS.

## ✨ Features

- 🎨 **Beautiful Design**: Modern, gradient-based UI with smooth animations
- 📱 **Cross-Platform**: Works on desktop, Android, and iOS
- 🚀 **Smart Detection**: Automatically detects installability and platform
- 🎯 **Multiple Styles**: Modal, banner, and floating button options
- ⚡ **Performance**: Lightweight with minimal bundle impact
- 🔧 **Customizable**: Easy to customize colors, text, and behavior

## 🚀 Quick Start

The PWA installation banner is already integrated into your app layout. It will automatically appear when:

1. The app is installable (meets PWA criteria)
2. The user hasn't already installed the app
3. The user hasn't dismissed the prompt

## 📦 Components

### 1. PWABanner (Default)
Bottom banner that appears automatically - **Already integrated!**

```tsx
import { PWABanner } from '@/components/pwa-banner';

// Already added to layout.tsx
<PWABanner />
```

### 2. PWAInstallPrompt
Full-screen modal with detailed information:

```tsx
import { PWAInstallPrompt } from '@/components/pwa-install-prompt';

<PWAInstallPrompt />
```

### 3. PWAInstallButton
Floating or inline install button:

```tsx
import { PWAInstallButton } from '@/components/pwa-install-button';

// Floating button (bottom-right corner)
<PWAInstallButton variant="floating" />

// Inline button (can be placed anywhere)
<PWAInstallButton variant="inline" />
```

### 4. usePWAInstall Hook
Custom hook for PWA installation logic:

```tsx
import { usePWAInstall } from '@/hooks/use-pwa-install';

function MyComponent() {
  const { isInstallable, isInstalled, isIOS, installApp, dismissInstall } = usePWAInstall();
  
  if (!isInstallable || isInstalled) return null;
  
  return (
    <button onClick={installApp}>
      Install App
    </button>
  );
}
```

## 🎨 Customization

### Colors
The components use CSS custom properties that can be overridden:

```css
:root {
  --pwa-primary: #3b82f6;
  --pwa-secondary: #8b5cf6;
  --pwa-background: #0f172a;
  --pwa-text: #ffffff;
}
```

### Text Content
Modify the text in the component files:

```tsx
// In pwa-banner.tsx or pwa-install-prompt.tsx
<h3 className="text-lg font-bold text-white">
  Install our <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">App</span>
</h3>
<p className="text-sm text-slate-300">
  Get faster access, offline support, and a better experience
</p>
```

### Timing
Adjust when the prompt appears:

```tsx
// In the component useEffect
const timer = setTimeout(() => {
  setIsVisible(true);
}, 3000); // Show after 3 seconds
```

## 📱 Platform Support

### Desktop (Chrome, Edge, Brave)
- ✅ Native install prompt
- ✅ Custom install button
- ✅ Full PWA features

### Android (Chrome)
- ✅ Native install prompt
- ✅ Custom install button
- ✅ Full PWA features

### iOS (Safari)
- ⚠️ Limited PWA support
- ✅ "Add to Home Screen" instructions
- ⚠️ Some features may not work

## 🔧 Configuration

### Manifest.json
Ensure your `public/manifest.json` is properly configured:

```json
{
  "name": "MANPASAND POS System",
  "short_name": "MANPASAND POS",
  "theme_color": "#3b82f6",
  "background_color": "#0f172a",
  "display": "standalone",
  "start_url": "/"
}
```

### Service Worker
Make sure you have a service worker registered for PWA functionality.

## 🧪 Testing

### Local Testing
1. Build your app: `yarn build`
2. Serve locally: `yarn serve`
3. Open in Chrome/Edge
4. Look for install icon in address bar
5. Test the custom prompts

### Mobile Testing
1. Deploy to HTTPS (required for PWA)
2. Open on mobile device
3. Test installation prompts
4. Verify app works offline

## 🎯 Best Practices

1. **Don't Spam**: Only show prompts when appropriate
2. **Respect Dismissal**: Don't show again if user dismisses
3. **Clear Benefits**: Explain why users should install
4. **Mobile First**: Design for mobile, enhance for desktop
5. **Test Thoroughly**: Test on multiple devices and browsers

## 🐛 Troubleshooting

### Prompt Not Showing
- Check if app meets PWA criteria
- Verify service worker is registered
- Ensure HTTPS (required for PWA)
- Check browser console for errors

### Installation Fails
- Verify manifest.json is valid
- Check service worker registration
- Ensure all required icons exist
- Test in different browsers

### iOS Issues
- iOS has limited PWA support
- Must use Safari for installation
- Some features may not work
- Provide clear instructions

## 📚 Resources

- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [Manifest.json Reference](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Service Worker Guide](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

**Need help?** Check the browser console for errors or refer to the PWA documentation.
