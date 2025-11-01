/**
 * Start the Windows Service
 */

const { Service } = require('node-windows');
const path = require('path');

const scriptPath = path.resolve(__dirname, 'server.js');

const svc = new Service({
  name: 'Manpasand Print Server',
  script: scriptPath
});

svc.on('start', function() {
  console.log('✅ Print Server service started!');
  console.log('🌐 Server running on http://localhost:3001');
});

svc.on('error', function(err) {
  console.error('❌ Error starting service:', err);
  console.error('');
  console.error('Make sure the service is installed: node install-service.js');
});

console.log('🚀 Starting Manpasand Print Server service...');
svc.start();

