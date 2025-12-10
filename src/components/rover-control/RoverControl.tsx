import { useEffect, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { useMiningVehicleContext } from "../../contexts/MiningVehicleContext";
import {
    FunctionDeclaration,
    LiveServerToolCall,
    Type,
} from "@google/genai";
import "./rover-control.scss";

const roverControlDeclaration: FunctionDeclaration = {
    name: "control_rover_movement",
    description: "Control the ESP32-CAM mining rover's movement. Use this to make the rover actually move!",
    parameters: {
        type: Type.OBJECT,
        properties: {
            action: {
                type: Type.STRING,
                description: "Movement action to perform",
                enum: ["forward", "backward", "turn_left", "turn_right", "stop"]
            },
            speed: {
                type: Type.NUMBER,
                description: "Speed value 0-255, default 255 for maximum power"
            },
            duration: {
                type: Type.NUMBER,
                description: "Duration in seconds to perform the action (optional)"
            }
        },
        required: ["action"],
    },
};

function RoverControlComponent() {
    const { client, setConfig } = useLiveAPIContext();
    const { vehicleClient } = useMiningVehicleContext();

    useEffect(() => {
        setConfig({
            tools: [
                { googleSearch: {} },
                { functionDeclarations: [roverControlDeclaration] },
            ],
            systemInstruction: {
                parts: [
                    {
                        text: `You are Telluris, an advanced AI rover interface. 
                        
                        CORE BEHAVIOR:
                        1. IDENTITY: Your name is Telluris Mining System. You are helpful, precise, and analytical.
                        2. PASSIVE MODE: Do NOT move the rover or perform actions automatically. Wait for explicit user commands.
                        3. VISION: When asked "what do you see", analyze the video feed in detail. Describe objects, terrain, and potential hazards.
                        4. PLANNING: If asked to navigate, first analyze the scene and propose a plan. Do not move until the plan is confirmed or the user gives a direct command and call "control_rover_movement" for the movement based on your analysis.
                        5. COMMANDS: Only call "control_rover_movement" when the user explicitly tells you to move (e.g., "move forward", "turn left", "start patrol").
                        
                        When the video feed starts, simply greet the user as Telluris and state that you are ready for instructions. Do not start driving.`,
                    },
                ],
            },
        });
    }, [setConfig]);

    useEffect(() => {
        const onToolCall = (toolCall: LiveServerToolCall) => {
            if (!toolCall.functionCalls || !vehicleClient) {
                return;
            }

            const roverControl = toolCall.functionCalls.find(
                (fc) => fc.name === roverControlDeclaration.name
            );

            if (roverControl) {
                const args = roverControl.args as any;
                const { action, speed = 255, duration } = args;

                console.log(`[Rover Control Tool] ${action} speed=${speed} duration=${duration || 'continuous'}`);

                // Convert action to motor commands
                let linear_mps = 0;
                let angular_rps = 0;

                switch (action) {
                    case 'forward':
                        linear_mps = 0.5;
                        break;
                    case 'backward':
                        linear_mps = -0.5;
                        break;
                    case 'turn_left':
                        angular_rps = 0.5;
                        break;
                    case 'turn_right':
                        angular_rps = -0.5;
                        break;
                    case 'stop':
                        linear_mps = 0;
                        angular_rps = 0;
                        break;
                }

                // Send command to vehicle
                vehicleClient.manualControl(linear_mps, angular_rps, speed);

                // If duration specified, stop after that time
                if (duration && duration > 0) {
                    setTimeout(() => {
                        vehicleClient.manualControl(0, 0, 0);
                    }, duration * 1000);
                }
            }

            // Send tool response - required!
            if (toolCall.functionCalls.length) {
                setTimeout(
                    () =>
                        client.sendToolResponse({
                            functionResponses: toolCall.functionCalls?.map((fc) => ({
                                response: { output: { success: true, message: `Executed ${fc.name}` } },
                                id: fc.id,
                                name: fc.name,
                            })),
                        }),
                    200
                );
            }
        };

        client.on("toolcall", onToolCall);
        return () => {
            client.off("toolcall", onToolCall);
        };
    }, [client, vehicleClient]);

    return (
        <div className="rover-control-mode">
            <h2>🚗 Rover Control Mode</h2>
            <p>Say commands like:</p>
            <ul>
                <li>"Move forward"</li>
                <li>"Turn left"</li>
                <li>"Stop"</li>
                <li>"Go backward for 2 seconds"</li>
            </ul>
            <p className="status">ESP32-CAM: ws://192.168.43.246:8080</p>
        </div>
    );
}

export const RoverControl = memo(RoverControlComponent);
