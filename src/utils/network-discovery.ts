/**
 * Network Discovery Utility
 * Helps discover ESP32 devices on the local network
 */

export interface DiscoveredDevice {
    ip: string;
    port: number;
    status: 'online' | 'offline';
    responseTime?: number;
}

/**
 * Attempts to connect to a WebSocket endpoint to check if it's available
 */
async function testWebSocketConnection(ip: string, port: number, timeout: number = 2000): Promise<boolean> {
    return new Promise((resolve) => {
        const ws = new WebSocket(`ws://${ip}:${port}`);
        const timer = setTimeout(() => {
            ws.close();
            resolve(false);
        }, timeout);

        ws.onopen = () => {
            clearTimeout(timer);
            ws.close();
            resolve(true);
        };

        ws.onerror = () => {
            clearTimeout(timer);
            resolve(false);
        };
    });
}

/**
 * Scans a range of IP addresses for ESP32 WebSocket servers
 * @param baseIP - Base IP address (e.g., "192.168.43")
 * @param startRange - Starting host number (default: 1)
 * @param endRange - Ending host number (default: 254)
 * @param port - WebSocket port (default: 8080)
 */
export async function scanNetwork(
    baseIP: string,
    startRange: number = 1,
    endRange: number = 254,
    port: number = 8080
): Promise<DiscoveredDevice[]> {
    console.log(`Scanning network ${baseIP}.${startRange}-${endRange}:${port}...`);

    const devices: DiscoveredDevice[] = [];
    const promises: Promise<void>[] = [];

    for (let i = startRange; i <= endRange; i++) {
        const ip = `${baseIP}.${i}`;

        const promise = (async () => {
            const startTime = Date.now();
            const isOnline = await testWebSocketConnection(ip, port);
            const responseTime = Date.now() - startTime;

            if (isOnline) {
                devices.push({
                    ip,
                    port,
                    status: 'online',
                    responseTime
                });
                console.log(`✓ Found device at ${ip}:${port} (${responseTime}ms)`);
            }
        })();

        promises.push(promise);
    }

    await Promise.all(promises);

    console.log(`Scan complete. Found ${devices.length} device(s)`);
    return devices.sort((a, b) => (a.responseTime || 0) - (b.responseTime || 0));
}

/**
 * Gets the current device's local IP address (best guess)
 */
export function getLocalIPPrefix(): string | null {
    // This is a heuristic - we can't directly get the IP in browser
    // But we can make educated guesses based on common patterns

    // Common mobile hotspot patterns:
    const commonPrefixes = [
        '192.168.43',  // Android hotspot
        '192.168.137', // Windows hotspot
        '172.20.10',   // iOS hotspot
        '192.168.1',   // Common router
        '192.168.0',   // Common router
    ];

    return commonPrefixes[0]; // Default to Android hotspot
}

/**
 * Quick scan of common hotspot IP ranges
 */
export async function quickScan(port: number = 8080): Promise<DiscoveredDevice[]> {
    const prefixes = [
        '192.168.43',  // Android hotspot
        '192.168.137', // Windows hotspot  
        '172.20.10',   // iOS hotspot
    ];

    const allDevices: DiscoveredDevice[] = [];

    for (const prefix of prefixes) {
        console.log(`Scanning ${prefix}.x...`);
        const devices = await scanNetwork(prefix, 1, 254, port);
        allDevices.push(...devices);
    }

    return allDevices;
}
