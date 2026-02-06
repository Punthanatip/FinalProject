CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Create fod_classes table to store FOD object types
CREATE TABLE IF NOT EXISTS fod_classes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create events table to store detection events
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    class_id INTEGER NOT NULL REFERENCES fod_classes(id),
    object_count INTEGER NOT NULL DEFAULT 1,
    confidence REAL NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    source VARCHAR(255) NOT NULL,
    source_ref VARCHAR(255) NOT NULL,
    bbox JSONB, -- Bounding box coordinates as JSON
    meta JSONB, -- Additional metadata as JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_ts_desc ON events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_class_id ON events (class_id);
CREATE INDEX IF NOT EXISTS idx_events_source_ref ON events (source_ref);

-- Insert default FOD classes
INSERT INTO fod_classes (name, description) VALUES
    ('Bolt', 'Metal bolt or fastener'),
    ('Nut', 'Metal nut'),
    ('Screw', 'Metal screw'),
    ('Wire', 'Wire or cable piece'),
    ('Scrap Metal', 'Metal fragment or debris'),
    ('Stone', 'Stone or rock'),
    ('Paper', 'Paper or cardboard debris'),
    ('Plastic', 'Plastic debris'),
    ('Glass', 'Glass fragments'),
    ('Cloth', 'Fabric or textile'),
    ('Tire Pieces', 'Rubber tire fragments'),
    ('Other', 'Other foreign object debris')
ON CONFLICT (name) DO NOTHING;
