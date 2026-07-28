-- AR Tourism columns for establishments table
-- Run this migration to enable GPS-based AR establishment lookup

ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS wallet_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS accepts_qr_pay BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS heritage BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS heritage_description TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_multiplier DECIMAL(4,2) DEFAULT 1.0;

-- Create index for GPS-based radius queries
CREATE INDEX IF NOT EXISTS idx_establishments_gps
  ON establishments (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create index for heritage filter
CREATE INDEX IF NOT EXISTS idx_establishments_heritage
  ON establishments (heritage)
  WHERE heritage = TRUE;

-- Create index for QR pay filter
CREATE INDEX IF NOT EXISTS idx_establishments_qr_pay
  ON establishments (accepts_qr_pay)
  WHERE accepts_qr_pay = TRUE;
