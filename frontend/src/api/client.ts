// src/api/client.ts
import axios from 'axios';

export interface Room {
    id: number;
    name: string;
    area: string;
    capacity: number;
    tolerance: number;
    is_active: boolean;
    current_occupancy?: number;
}

export interface Child {
    id: number;
    name: string;
    photo_url: string | null;
    tracker_uid: string;
    is_active: boolean;
}

export interface MovementLogEntry {
    id: number;
    child_id: number;
    child_name: string;
    from_room_id: number | null;
    from_room_name: string | null;
    to_room_id: number | null;
    to_room_name: string | null;
    occurred_at: string;
    source: string;
}

export interface Alert {
    id: number;
    room: {
        id: number;
        name: string;
    };
    type: string;
    level: string;
    code: string | null;
    message: string;
    is_active: boolean;
    payload: Record<string, unknown> | null;
    triggered_at: string | null;
    resolved_at: string | null;
}

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost',
});

export async function fetchRooms(): Promise<Room[]> {
    const { data } = await api.get<Room[]>('/api/v1/rooms');

    return data;
}

export async function fetchChildren(): Promise<Child[]> {
    const { data } = await api.get<Child[]>('/api/v1/children');

    return data;
}

export async function fetchMovementLog(
    params?: Partial<{
        child_id: number;
        room_id: number;
        from: string;
        to: string;
        limit: number;
    }>,
): Promise<MovementLogEntry[]> {
    const { data } = await api.get<MovementLogEntry[]>('/api/v1/movement-log', { params });

    return data;
}

export async function fetchActiveAlerts(): Promise<Alert[]> {
    const { data } = await api.get<Alert[]>('/api/v1/alerts', {
        params: { active: 1 },
    });

    return data;
}
