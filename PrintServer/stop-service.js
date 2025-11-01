/**
 * Stop the Windows Service
 */

const { Service } = require('node-windows');
const path = require('path');

const scriptPath = path.resolve(__dirname, 'server.js');

const svc = new Service({
  name: 'Manpasand Print Server',
  script: scriptPath
});

svc.on('stop', function() {
  console.log('🛑 Print Server service stopped!');
});

svc.on('error', function(err) {
  console.error('❌ Error stopping service:', err);
  console.error('');
  console.error('Service might not be installed or already stopped');
});

console.log('🛑 Stopping Manpasand Print Server service...');
svc.stop();

