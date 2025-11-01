/**
 * Windows Service Installer for Manpasand POS Print Server
 * 
 * This script installs the print server as a Windows service that:
 * - Starts automatically when Windows boots
 * - Automatically restarts if it crashes or closes
 * - Runs in the background without user interaction
 * 
 * Run: node install-service.js
 * Uninstall: node uninstall-service.js
 */

const path = require('path');
const { Service } = require('node-windows');
const os = require('os');

// Get the directory where this script is located
const scriptPath = path.resolve(__dirname, 'server.js');

// Create a new service object
const svc = new Service({
  name: 'Manpasand Print Server',
  description: 'Local print server for Manpasand POS receipt printing',
  script: scriptPath,
  nodeOptions: [
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    }
  ]
});

// Listen for the "install" event, which indicates the process is available as a service
svc.on('install', function() {
  console.log('✅ Print Server service installed successfully!');
  console.log('📋 Service will start automatically on Windows boot');
  console.log('🔄 Service will auto-restart if it crashes or closes');
  console.log('');
  console.log('To start the service now, run:');
  console.log('  node start-service.js');
  console.log('');
  console.log('To uninstall the service, run:');
  console.log('  node uninstall-service.js');
});

// Listen for the "alreadyinstalled" event
svc.on('alreadyinstalled', function() {
  console.log('⚠️  Service is already installed!');
  console.log('To reinstall, first run: node uninstall-service.js');
});

// Listen for errors during installation
svc.on('error', function(err) {
  console.error('❌ Error installing service:', err);
  console.error('');
  console.error('Common issues:');
  console.error('1. Run this script as Administrator');
  console.error('2. Make sure node-windows is installed: npm install node-windows --save');
  console.error('3. Check if the service is already installed');
});

// Install the service
console.log('🔧 Installing Manpasand Print Server as Windows service...');
console.log('📁 Service path: ' + scriptPath);
console.log('');

// Check if running as administrator
if (os.userInfo().username === 'Administrator' || process.getuid && process.getuid() === 0) {
  svc.install();
} else {
  console.log('⚠️  WARNING: This script should be run as Administrator');
  console.log('⚠️  Right-click and select "Run as administrator"');
  console.log('');
  console.log('Installing anyway (may fail if not admin)...');
  console.log('');
  svc.install();
}

