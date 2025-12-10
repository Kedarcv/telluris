import React, { useEffect, useRef } from 'react';
import { Detection } from '../../mining/types';
import './detection-overlay.scss';

interface DetectionOverlayProps {
    videoRef: React.RefObject<HTMLVideoElement>;
    detections: Detection[];
    videoStream: MediaStream | null;
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({
    videoRef,
    detections,
    videoStream
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current || !videoRef.current || !videoStream) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Match canvas size to video size
        const updateCanvasSize = () => {
            if (video.videoWidth && video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                // Match the display size
                const rect = video.getBoundingClientRect();
                canvas.style.width = `${rect.width}px`;
                canvas.style.height = `${rect.height}px`;
            }
        };

        // Update size when video metadata loads
        video.addEventListener('loadedmetadata', updateCanvasSize);
        updateCanvasSize();

        // Animation loop to draw detections
        let animationId: number;
        const draw = () => {
            if (!ctx || !canvas.width || !canvas.height) return;

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw each detection
            detections.forEach((detection) => {
                if (!detection.bbox) return;

                const { x, y, width, height } = detection.bbox;
                const confidence = detection.confidence;
                const className = detection.class;

                // Color based on class
                let color = '#00FF00'; // Default green
                if (className === 'person') {
                    color = '#FF0000'; // Red for persons (critical)
                } else if (className === 'truck') {
                    color = '#FFA500'; // Orange for trucks
                } else if (className === 'equipment') {
                    color = '#FFFF00'; // Yellow for equipment
                }

                // Draw bounding box
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, width, height);

                // Draw filled background for label
                const label = `${className} ${(confidence * 100).toFixed(0)}%`;
                ctx.font = '16px Arial';
                const textMetrics = ctx.measureText(label);
                const textHeight = 20;
                const padding = 4;

                ctx.fillStyle = color;
                ctx.fillRect(
                    x,
                    y - textHeight - padding,
                    textMetrics.width + padding * 2,
                    textHeight + padding
                );

                // Draw label text
                ctx.fillStyle = '#000000';
                ctx.fillText(label, x + padding, y - padding);

                // Draw center point
                const centerX = x + width / 2;
                const centerY = y + height / 2;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
                ctx.fill();
            });

            animationId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            video.removeEventListener('loadedmetadata', updateCanvasSize);
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
        };
    }, [videoRef, detections, videoStream]);

    return (
        <canvas
            ref={canvasRef}
            className="detection-overlay"
        />
    );
};
