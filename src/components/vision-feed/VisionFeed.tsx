import React, { useEffect } from 'react';
import { useMiningVehicleContext } from '../../contexts/MiningVehicleContext';

interface VisionFeedProps {
  videoStream: MediaStream | null;
}

export const VisionFeed: React.FC<VisionFeedProps> = ({ videoStream }) => {
  const { setVideoStream } = useMiningVehicleContext();
  
  useEffect(() => {
    // Update mining context with video stream
    setVideoStream(videoStream);
  }, [videoStream, setVideoStream]);
  
  return null; // This is just a connector component
};