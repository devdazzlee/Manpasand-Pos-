#!/bin/bash

# PWA Installation Test Script
# This script helps you test the PWA installation functionality

echo "🚀 MANPASAND POS - PWA Installation Test"
echo "========================================"
echo ""

# Check if we're in the Frontend directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the Frontend directory"
    exit 1
fi

echo "📦 Building the PWA..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "🌐 Starting local server..."
    echo "   The app will be available at: http://localhost:3000"
    echo ""
    echo "📱 Testing Instructions:"
    echo "   1. Open http://localhost:3000 in Chrome/Edge"
    echo "   2. Look for the install icon (⊕) in the address bar"
    echo "   3. The custom install banner should appear at the bottom"
    echo "   4. Test the installation process"
    echo ""
    echo "📱 Mobile Testing:"
    echo "   1. Deploy to HTTPS (required for PWA)"
    echo "   2. Open on mobile device"
    echo "   3. Test installation prompts"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   - Make sure you're using HTTPS for mobile testing"
    echo "   - Check browser console for any errors"
    echo "   - Verify service worker is registered"
    echo ""
    
    # Start the server
    npm run serve
else
    echo "❌ Build failed. Please check the errors above."
    exit 1
fi
