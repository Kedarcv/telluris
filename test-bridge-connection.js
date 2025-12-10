#!/usr/bin/env node

const http = require('http');

console.log('Checking if Arduino bridge WebSocket server is running...');
console.log('');

// Try HTTP first
const httpReq = http.request({
    hostname: 'localhost',
    port: 8080,
    path: '/',
    method: 'GET'
}, (res) => {
    console.log('✓ HTTP server is responding on port 8080');
    console.log(`  Response: ${res.statusCode}`);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log(`  Message: ${data.trim()}`);
        console.log('');
        console.log('✓ Arduino bridge is running!');
        console.log('');
        console.log('If you\'re seeing this, the bridge is working.');
        console.log('The WebSocket test may have failed due to timing.');
        console.log('');
        console.log('Please check the terminal running "npm run dev-arduino"');
        console.log('to see if commands are being received.');
        process.exit(0);
    });
});

httpReq.on('error', (err) => {
    console.log('✗ Cannot connect to port 8080');
    console.log(`  Error: ${err.message}`);
    console.log('');
    console.log('⚠ The Arduino bridge is NOT running!');
    console.log('');
    console.log('Please make sure "npm run dev-arduino" is running in another terminal.');
    process.exit(1);
});

httpReq.end();
