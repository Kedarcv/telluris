#!/usr/bin/env node
// Helper script to find Arduino serial port
// Run with: node src/mining/find-arduino-port.js

const { SerialPort } = require('serialport');

async function findArduinoPorts() {
    try {
        const ports = await SerialPort.list();

        console.log('\n=== Available Serial Ports ===\n');

        if (ports.length === 0) {
            console.log('No serial ports found!');
            console.log('\nMake sure:');
            console.log('1. Arduino is connected via USB');
            console.log('2. Arduino drivers are installed');
            console.log('3. USB cable supports data (not just power)');
            return;
        }

        const arduinoPorts = [];

        ports.forEach((port, index) => {
            console.log(`${index + 1}. ${port.path}`);

            if (port.manufacturer) {
                console.log(`   Manufacturer: ${port.manufacturer}`);
            }
            if (port.serialNumber) {
                console.log(`   Serial Number: ${port.serialNumber}`);
            }
            if (port.vendorId) {
                console.log(`   Vendor ID: ${port.vendorId}`);
            }
            if (port.productId) {
                console.log(`   Product ID: ${port.productId}`);
            }

            // Detect Arduino boards
            const isArduino =
                (port.manufacturer && port.manufacturer.toLowerCase().includes('arduino')) ||
                (port.vendorId === '2341') || // Arduino vendor ID
                (port.vendorId === '1a86') || // CH340 chip (common on clones)
                (port.vendorId === '0403') || // FTDI chip
                port.path.includes('usbmodem') ||
                port.path.includes('usbserial');

            if (isArduino) {
                arduinoPorts.push(port.path);
                console.log('   ✓ Likely Arduino board');
            }

            console.log('');
        });

        if (arduinoPorts.length > 0) {
            console.log('=== Detected Arduino Ports ===\n');
            arduinoPorts.forEach(path => {
                console.log(`  ${path}`);
            });
            console.log('\nTo use this port, run:');
            console.log(`  ARDUINO_PORT=${arduinoPorts[0]} npm run arduino-bridge`);
            console.log('\nOr update the ARDUINO_PORT in arduino-serial-bridge.js');
        } else {
            console.log('No Arduino boards detected.');
            console.log('If your Arduino is connected, try one of the ports listed above.');
        }

    } catch (error) {
        console.error('Error listing serial ports:', error.message);
        console.log('\nYou may need to install serialport:');
        console.log('  npm install serialport @serialport/parser-readline');
    }
}

findArduinoPorts();
