const WebSocket = require('ws');

// Connect to the Arduino bridge WebSocket
const ws = new WebSocket('ws://localhost:8080/esp32');

ws.on('open', () => {
    console.log('✓ Connected to Arduino bridge');
    console.log('');

    // Test 1: Send a simple drive command
    console.log('TEST 1: Sending drive command (forward for 2 seconds)...');
    const driveCmd = {
        type: 'drive',
        id: 'test-001',
        linear_mps: 0.5,
        angular_rps: 0,
        duration_s: 2
    };

    console.log('Sending:', JSON.stringify(driveCmd, null, 2));
    ws.send(JSON.stringify(driveCmd));

    // Test 2: Send digital output command (AI trigger) after 3 seconds
    setTimeout(() => {
        console.log('');
        console.log('TEST 2: Sending digital output command (AI_TRIGGER_PIN HIGH)...');
        const ioCmd = {
            type: 'io',
            id: 'test-002',
            pin: 12,
            state: 'high'
        };

        console.log('Sending:', JSON.stringify(ioCmd, null, 2));
        ws.send(JSON.stringify(ioCmd));

        // Turn it off after 1 second
        setTimeout(() => {
            console.log('');
            console.log('TEST 3: Sending digital output command (AI_TRIGGER_PIN LOW)...');
            const ioCmd2 = {
                type: 'io',
                id: 'test-003',
                pin: 12,
                state: 'low'
            };

            console.log('Sending:', JSON.stringify(ioCmd2, null, 2));
            ws.send(JSON.stringify(ioCmd2));

            // Close after 2 more seconds
            setTimeout(() => {
                console.log('');
                console.log('Tests complete, closing connection...');
                ws.close();
            }, 2000);
        }, 1000);
    }, 3000);
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        console.log('← Arduino response:', JSON.stringify(msg, null, 2));
    } catch (e) {
        console.log('← Arduino (raw):', data.toString());
    }
});

ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log('');
    console.log('✓ Connection closed');
    process.exit(0);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('');
    console.log('Interrupted, closing...');
    ws.close();
    process.exit(0);
});
