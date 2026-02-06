/**
 * BoundingBox component for image mode overlay
 * Used only for static image detection (not video/live which uses server-side rendering)
 */

import { useEffect, useState, useRef } from 'react';

export interface Detection {
    id: string;
    class: string;
    confidence: number;
    bbox: { x1: number; y1: number; x2: number; y2: number };
    img_w?: number;
    img_h?: number;
}

interface BoundingBoxProps {
    detection: Detection;
    mediaWidth: number;
    mediaHeight: number;
}

export function BoundingBox({ detection, mediaWidth, mediaHeight }: BoundingBoxProps) {
    const boxRef = useRef<HTMLDivElement>(null);
    const [computedDims, setComputedDims] = useState({ dw: 1, dh: 1, ox: 0, oy: 0 });

    useEffect(() => {
        const compute = () => {
            if (!boxRef.current) return;

            const container = boxRef.current.closest('[data-monitoring-container]') as HTMLElement;
            if (!container) return;

            const img = container.querySelector('img') as HTMLImageElement;
            if (!img) return;

            const cr = container.getBoundingClientRect();
            const mr = img.getBoundingClientRect();

            const mw = Math.max(1, mediaWidth);
            const mh = Math.max(1, mediaHeight);

            const scale = Math.min(mr.width / mw, mr.height / mh);
            const dw = mw * scale;
            const dh = mh * scale;

            const ox = (mr.left - cr.left) + (mr.width - dw) / 2;
            const oy = (mr.top - cr.top) + (mr.height - dh) / 2;

            setComputedDims({ dw, dh, ox, oy });
        };

        compute();
        window.addEventListener('resize', compute);
        return () => window.removeEventListener('resize', compute);
    }, [mediaWidth, mediaHeight, detection]);

    const { bbox, confidence } = detection;
    const mw = Math.max(1, mediaWidth);
    const mh = Math.max(1, mediaHeight);
    const { dw, dh, ox, oy } = computedDims;

    const scaleX = dw / mw;
    const scaleY = dh / mh;

    const left = ox + bbox.x1 * scaleX;
    const top = oy + bbox.y1 * scaleY;
    const width = (bbox.x2 - bbox.x1) * scaleX;
    const height = (bbox.y2 - bbox.y1) * scaleY;

    // Color based on confidence
    const getColor = () => {
        if (confidence >= 0.9) return '#FF3B30'; // Red - critical
        if (confidence >= 0.75) return '#FFCC00'; // Yellow - warning
        return '#007BFF'; // Blue - normal
    };

    const color = getColor();

    return (
        <div
            ref={boxRef}
            className="absolute pointer-events-none z-10"
            style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                border: `2px solid ${color}`,
                borderRadius: '4px',
            }}
        >
            <div
                className="absolute -top-6 left-0 px-2 py-0.5 text-xs text-white rounded"
                style={{ backgroundColor: color }}
            >
                {detection.class} {(confidence * 100).toFixed(0)}%
            </div>
        </div>
    );
}
