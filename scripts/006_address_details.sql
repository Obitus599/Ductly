-- 006: Add structured address details to bookings
-- Stores building name, flat/unit, floor, directions, lat/lng, area, city
-- The existing `address` TEXT column remains as the geocodable formatted address

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS address_details JSONB;

-- Index for querying by area/city from the JSONB
CREATE INDEX IF NOT EXISTS idx_bookings_address_area
  ON bookings ((address_details->>'area'));

CREATE INDEX IF NOT EXISTS idx_bookings_address_city
  ON bookings ((address_details->>'city'));

-- JSONB structure:
-- {
--   "formatted_address": "Villa 42, Street 12, Al Barsha 2, Dubai",
--   "building_name": "Marina Tower 3",
--   "flat_number": "Apt 1204",
--   "floor": "12",
--   "additional_directions": "Enter from Gate 3...",
--   "lat": 25.2048,
--   "lng": 55.2708,
--   "place_id": "ChIJ...",
--   "area": "Al Barsha",
--   "city": "Dubai"
-- }
