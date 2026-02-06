/**
 * Shared utility functions for FOD Detection System
 */

/** Get severity color based on confidence level */
export function getSeverityColor(confidence: number): string {
    if (confidence >= 0.90) return '#FF3B30'; // Critical - Red
    if (confidence >= 0.75) return '#FFCC00'; // Warning - Yellow
    return '#007BFF'; // Normal - Blue
}

/** Get severity level name */
export function getSeverityLevel(confidence: number): 'critical' | 'warning' | 'normal' {
    if (confidence >= 0.90) return 'critical';
    if (confidence >= 0.75) return 'warning';
    return 'normal';
}

/** Format ISO timestamp to local time string */
export function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', { hour12: false });
}

/** Convert various timestamp formats to ISO string */
export function toIsoTimestamp(ts: unknown): string {
    if (typeof ts === 'string') return ts;
    if (Array.isArray(ts)) {
        const year = ts[0];
        const ordinal = ts[1];
        const hour = ts[3] || 0;
        const minute = ts[4] || 0;
        const nanos = ts[5] || 0;
        const mdays = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let m = 0, dday = ordinal;
        while (m < 12 && dday > mdays[m]) { dday -= mdays[m]; m++; }
        const ms = Math.floor(nanos / 1e6);
        return new Date(Date.UTC(year, m, dday, hour, minute, Math.floor(ms / 1000), ms % 1000)).toISOString();
    }
    return new Date().toISOString();
}

/** Chart colors palette */
export const CHART_COLORS = ['#FF3B30', '#FFCC00', '#007BFF', '#34C759', '#8E8E93', '#AF52DE', '#FF9500', '#00C7BE', '#5856D6', '#FF2D55'];

/** Get chart color by index */
export function getChartColor(index: number): string {
    return CHART_COLORS[index % CHART_COLORS.length];
}
