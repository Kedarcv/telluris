import React from 'react';
import './MiningDashboard.scss';

export const MiningDashboard: React.FC = () => {
    return (
        <div className="mining-dashboard">
            <header className="dashboard-header">
                <h1>Telluris Operations Dashboard</h1>
                <span className="status-badge live">LIVE FEED ACTIVE</span>
            </header>

            <div className="dashboard-grid">
                {/* Gas Levels Card */}
                <div className="dashboard-card gas-card">
                    <div className="card-header">
                        <span className="icon">☁️</span>
                        <h3>Gas Levels</h3>
                    </div>
                    <div className="card-content">
                        <div className="metric-row">
                            <span className="label">CO2</span>
                            <span className="value">450 <small>ppm</small></span>
                            <span className="status normal">Normal</span>
                        </div>
                        <div className="metric-row">
                            <span className="label">O2</span>
                            <span className="value">20.9 <small>%</small></span>
                            <span className="status normal">Normal</span>
                        </div>
                        <div className="metric-row">
                            <span className="label">CH4</span>
                            <span className="value">0.0 <small>%</small></span>
                            <span className="status normal">Normal</span>
                        </div>
                    </div>
                </div>

                {/* Lux Intensity Card */}
                <div className="dashboard-card lux-card">
                    <div className="card-header">
                        <span className="icon">💡</span>
                        <h3>Lux Intensity</h3>
                    </div>
                    <div className="card-content centered">
                        <div className="big-value">450</div>
                        <div className="unit">Lux</div>
                        <div className="status optimal">Optimal for Camera</div>
                    </div>
                </div>

                {/* GPS Location Card */}
                <div className="dashboard-card gps-card">
                    <div className="card-header">
                        <span className="icon">📍</span>
                        <h3>GPS Location</h3>
                    </div>
                    <div className="card-content">
                        <div className="location-name">Rainbow Towers Hotel</div>
                        <div className="location-city">Harare, Zimbabwe</div>
                        <div className="coordinates">
                            <div>LAT: -17.8317</div>
                            <div>LNG: 31.0456</div>
                        </div>
                        <div className="map-placeholder">
                            [Map View Placeholder]
                        </div>
                    </div>
                </div>

                {/* Confidence Levels Card */}
                <div className="dashboard-card confidence-card">
                    <div className="card-header">
                        <span className="icon">🤖</span>
                        <h3>AI Confidence</h3>
                    </div>
                    <div className="card-content centered">
                        <div className="confidence-ring">
                            <span className="percentage">98%</span>
                        </div>
                        <div className="status high">High Confidence</div>
                        <div className="detail">Object Detection: Stable</div>
                    </div>
                </div>

                {/* Mapped Area Card */}
                <div className="dashboard-card map-stats-card">
                    <div className="card-header">
                        <span className="icon">🗺️</span>
                        <h3>Mapped Area</h3>
                    </div>
                    <div className="card-content">
                        <div className="metric-row">
                            <span className="label">Total Area</span>
                            <span className="value">120 <small>m²</small></span>
                        </div>
                        <div className="metric-row">
                            <span className="label">Waypoints</span>
                            <span className="value">14</span>
                        </div>
                        <div className="metric-row">
                            <span className="label">Hazards</span>
                            <span className="value">0</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
