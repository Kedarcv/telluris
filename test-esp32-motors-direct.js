const WebSocket = require('ws');

console.log('Connecting to ESP32-CAM at ws://172.20.10.2:8080...');

const ws = new WebSocket('ws://172.20.10.2:8080');

ws.on('open', () => {
    console.log('✓ Connected to ESP32-CAM!\n');

    // Test 1: Move forward
    console.log('TEST 1: Sending forward command...');
    ws.send(JSON.stringify({
        type: 'drive',
        linear_mps: 0.5,
        angular_rps: 0
    }));

    setTimeout(() => {
        // Test 2: Stop
        console.log('TEST 2: Sending stop command...');
        ws.send(JSON.stringify({
            type: 'stop'
        }));

        setTimeout(() => {
            // Test 3: Turn left
            console.log('TEST 3: Sending turn left command...');
            ws.send(JSON.stringify({
                type: 'drive',
                linear_mps: 0,
                angular_rps: 0.5
            }));

            setTimeout(() => {
                // Test 4: Stop and close
                console.log('TEST 4: Sending final stop...');
                ws.send(JSON.stringify({
                    type: 'stop'
                }));

                setTimeout(() => {
                    console.log('\n✓ Tests complete!');
                    ws.close();
                }, 1000);
            }, 2000);
        }, 2000);
    }, 3000);
});

ws.on('message', (data) => {
    console.log('← ESP32-CAM:', data.toString());
});

ws.on('error', (error) => {
    console.error('✗ WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log('✓ Connection closed');
    process.exit(0);
});
