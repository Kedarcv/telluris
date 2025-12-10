import React, { useState } from 'react';
import { scanNetwork, quickScan, DiscoveredDevice } from '../../utils/network-discovery';
import './network-scanner.scss';

export const NetworkScanner: React.FC = () => {
    const [scanning, setScanning] = useState(false);
    const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
    const [customIP, setCustomIP] = useState('192.168.43');
    const [port, setPort] = useState(8080);

    const handleQuickScan = async () => {
        setScanning(true);
        setDevices([]);
        try {
            const found = await quickScan(port);
            setDevices(found);
        } catch (error) {
            console.error('Scan error:', error);
        } finally {
            setScanning(false);
        }
    };

    const handleCustomScan = async () => {
        setScanning(true);
        setDevices([]);
        try {
            const found = await scanNetwork(customIP, 1, 254, port);
            setDevices(found);
        } catch (error) {
            console.error('Scan error:', error);
        } finally {
            setScanning(false);
        }
    };

    const copyToClipboard = (ip: string) => {
        const url = `ws://${ip}:${port}`;
        navigator.clipboard.writeText(url);
        alert(`Copied: ${url}`);
    };

    return (
        <div className="network-scanner">
            <h2>🔍 ESP32 Network Scanner</h2>

            <div className="scanner-controls">
                <div className="control-group">
                    <label>Port:</label>
                    <input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(parseInt(e.target.value))}
                        disabled={scanning}
                    />
                </div>

                <button
                    onClick={handleQuickScan}
                    disabled={scanning}
                    className="btn-primary"
                >
                    {scanning ? '⏳ Scanning...' : '🚀 Quick Scan (All Common Networks)'}
                </button>
            </div>

            <div className="custom-scan">
                <h3>Custom Network Scan</h3>
                <div className="control-group">
                    <label>IP Prefix (e.g., 192.168.43):</label>
                    <input
                        type="text"
                        value={customIP}
                        onChange={(e) => setCustomIP(e.target.value)}
                        placeholder="192.168.43"
                        disabled={scanning}
                    />
                    <button
                        onClick={handleCustomScan}
                        disabled={scanning}
                        className="btn-secondary"
                    >
                        Scan {customIP}.1-254
                    </button>
                </div>
            </div>

            {scanning && (
                <div className="scanning-indicator">
                    <div className="spinner"></div>
                    <p>Scanning network... This may take a minute.</p>
                </div>
            )}

            {devices.length > 0 && (
                <div className="results">
                    <h3>✅ Found {devices.length} Device(s)</h3>
                    <div className="device-list">
                        {devices.map((device, idx) => (
                            <div key={idx} className="device-card">
                                <div className="device-info">
                                    <strong>ws://{device.ip}:{device.port}</strong>
                                    <span className="response-time">{device.responseTime}ms</span>
                                </div>
                                <button
                                    onClick={() => copyToClipboard(device.ip)}
                                    className="btn-copy"
                                >
                                    📋 Copy URL
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="usage-hint">
                        <p>💡 <strong>To use:</strong> Copy the URL and set it as <code>REACT_APP_ESP32_WS_URL</code> in your environment</p>
                        <p>Or update the MiningVehicleContext.tsx to use this IP directly</p>
                    </div>
                </div>
            )}

            {!scanning && devices.length === 0 && (
                <div className="no-results">
                    <p>No devices found yet. Click "Quick Scan" to search common networks.</p>
                </div>
            )}
        </div>
    );
};
