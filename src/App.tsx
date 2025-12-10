/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useRef, useState } from "react";
import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import { MiningVehicleProvider } from "./contexts/MiningVehicleContext";
import SidePanel from "./components/side-panel/SidePanel";
import { Altair } from "./components/altair/Altair";
import ControlTray from "./components/control-tray/ControlTray";
import { MiningControl } from "./components/mining-control/MiningControl";
import { VisionFeed } from "./components/vision-feed/VisionFeed";
import { DetectionOverlay } from "./components/detection-overlay/DetectionOverlay";
import { Detection } from "./mining/types";
import cn from "classnames";
import { LiveClientOptions } from "./types";
import { RoverControl } from "./components/rover-control/RoverControl";
import { MiningDashboard } from "./components/dashboard/MiningDashboard";
import { NetworkScanner } from "./components/network-scanner/NetworkScanner";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

type ActiveView = 'altair' | 'rover' | 'dashboard' | 'scanner';

function App() {
  // this video reference is used for displaying the active stream, whether that is the webcam or screen capture
  // feel free to style as you see fit
  const videoRef = useRef<HTMLVideoElement>(null);
  // either the screen capture, the video or null, if null we hide it
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  // Active view state
  const [activeView, setActiveView] = useState<ActiveView>('altair');
  // Detections for overlay
  const [detections, setDetections] = useState<Detection[]>([]);

  // ESP32 WebSocket URL - configure this based on your setup
  const esp32Url = process.env.REACT_APP_ESP32_WS_URL || "ws://172.20.10.2:8080";

  return (
    <div className="App">
      <LiveAPIProvider options={apiOptions}>
        <MiningVehicleProvider>
          <VisionFeed videoStream={videoStream} />
          <div className="streaming-console">
            <SidePanel />
            <main>
              <div className="main-app-area">
                {/* View Switching */}
                {activeView === 'altair' && <Altair />}
                {activeView === 'rover' && <RoverControl />}
                {activeView === 'dashboard' && <MiningDashboard />}

                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <video
                    className={cn("stream", {
                      hidden: !videoRef.current || !videoStream || activeView === 'dashboard',
                      "mining-mode": activeView === 'rover'
                    })}
                    ref={videoRef}
                    autoPlay
                    playsInline
                  />

                  {/* Detection overlay - shows bounding boxes */}
                  {activeView === 'rover' && videoStream && (
                    <DetectionOverlay
                      videoRef={videoRef}
                      detections={detections}
                      videoStream={videoStream}
                    />
                  )}
                </div>
              </div>

              <ControlTray
                videoRef={videoRef}
                supportsVideo={true}
                onVideoStreamChange={setVideoStream}
                enableEditingSettings={true}
              >
                {/* Navigation Buttons */}

                {/* Main Toggle: Altair <-> Mining (Rover) */}
                <button
                  className={cn("action-button mining-toggle", { active: activeView !== 'altair' })}
                  onClick={() => setActiveView(activeView === 'altair' ? 'rover' : 'altair')}
                  title={activeView === 'altair' ? "Switch to Mining Mode" : "Back to Altair"}
                >
                  <span className="material-symbols-outlined">
                    {activeView === 'altair' ? "construction" : "smart_toy"}
                  </span>
                  <span className="label">
                    {activeView === 'altair' ? "Mining Mode" : "Altair Mode"}
                  </span>
                </button>

                {/* Dashboard Toggle: Only visible in Mining Mode */}
                {activeView !== 'altair' && (
                  <button
                    className={cn("action-button dashboard-toggle", { active: activeView === 'dashboard' })}
                    onClick={() => setActiveView(activeView === 'dashboard' ? 'rover' : 'dashboard')}
                    title="Toggle Dashboard"
                  >
                    <span className="material-symbols-outlined">
                      {activeView === 'dashboard' ? "joystick" : "dashboard"}
                    </span>
                    <span className="label">
                      {activeView === 'dashboard' ? "Controls" : "Dashboard"}
                    </span>
                  </button>
                )}
              </ControlTray>
            </main>
          </div>
        </MiningVehicleProvider>
      </LiveAPIProvider>
    </div>
  );
}

export default App;
