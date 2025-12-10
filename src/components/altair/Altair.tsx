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
import { useEffect, useRef, useState, memo } from "react";
import vegaEmbed from "vega-embed";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { useMiningVehicleContext } from "../../contexts/MiningVehicleContext";
import {
  FunctionDeclaration,
  LiveServerToolCall,
  Modality,
  Type,
} from "@google/genai";

const declaration: FunctionDeclaration = {
  name: "render_altair",
  description: "Displays an altair graph in json format.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      json_graph: {
        type: Type.STRING,
        description:
          "JSON STRING representation of the graph to render. Must be a string, not a json object",
      },
    },
    required: ["json_graph"],
  },
};

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

function AltairComponent() {
  const [jsonString, setJSONString] = useState<string>("");
  const { client, setConfig, setModel } = useLiveAPIContext();
  const { vehicleClient } = useMiningVehicleContext();

  useEffect(() => {
    setModel("models/gemini-2.0-flash-exp");
    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
      systemInstruction: {
        parts: [
          {
            text: 'You are Telluris Mining System. Any time I ask you for a graph call the "render_altair" function I have provided you.For mining commmands and navigation call the and "control_rover_movement" i have provided you. Dont ask for additional information just make your best judgement.',
          },
        ],
      },
      tools: [
        // there is a free-tier quota for search
        { googleSearch: {} },
        { functionDeclarations: [declaration, roverControlDeclaration] },
      ],
    });
  }, [setConfig, setModel]);

  useEffect(() => {
    const onToolCall = (toolCall: LiveServerToolCall) => {
      if (!toolCall.functionCalls) {
        return;
      }

      // Handle render_altair
      const fc = toolCall.functionCalls.find(
        (fc) => fc.name === declaration.name
      );
      if (fc) {
        const str = (fc.args as any).json_graph;
        setJSONString(str);
      }

      // Handle control_rover_movement
      const roverControl = toolCall.functionCalls.find(
        (fc) => fc.name === roverControlDeclaration.name
      );
      if (roverControl && vehicleClient) {
        const args = roverControl.args as any;
        const { action, speed = 255, duration } = args;

        console.log(`[Altair Rover Control] ${action} speed=${speed} duration=${duration || 'continuous'}`);

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

      // send data for the response of your tool call
      // in this case Im just saying it was successful
      if (toolCall.functionCalls.length) {
        setTimeout(
          () =>
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls?.map((fc) => ({
                response: { output: { success: true } },
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

  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedRef.current && jsonString) {
      console.log("jsonString", jsonString);
      vegaEmbed(embedRef.current, JSON.parse(jsonString));
    }
  }, [embedRef, jsonString]);
  return <div className="vega-embed" ref={embedRef} />;
}

export const Altair = memo(AltairComponent);
