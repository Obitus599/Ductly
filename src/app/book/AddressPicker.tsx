"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { INPUT, LABEL } from "./shared";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface AddressDetails {
  formatted_address: string;
  building_name: string;
  flat_number: string;
  floor: string;
  additional_directions: string;
  lat: number | null;
  lng: number | null;
  place_id: string;
  area: string;
  city: string;
}

export const EMPTY_ADDRESS: AddressDetails = {
  formatted_address: "",
  building_name: "",
  flat_number: "",
  floor: "",
  additional_directions: "",
  lat: null,
  lng: null,
  place_id: "",
  area: "",
  city: "",
};

interface AddressPickerProps {
  value: AddressDetails;
  onChange: (v: AddressDetails) => void;
}

/* ─── Google Maps loader (singleton) ────────────────────────────────── */

let googlePromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if (window.google?.maps?.places) return Promise.resolve();
  if (googlePromise) return googlePromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set — map disabled");
    return Promise.reject("No API key");
  }

  googlePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&region=AE`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject("Failed to load Google Maps");
    document.head.appendChild(script);
  });

  return googlePromise;
}

/* ─── Dubai center ──────────────────────────────────────────────────── */

const DUBAI_CENTER = { lat: 25.2048, lng: 55.2708 };
const UAE_BOUNDS = {
  north: 26.5,
  south: 22.5,
  east: 56.5,
  west: 51.0,
};

/* ─── Component ─────────────────────────────────────────────────────── */

export default function AddressPicker({ value, onChange }: AddressPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [noApiKey, setNoApiKey] = useState(false);

  // Track changes without causing re-render loops
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /* ── Load Google Maps ── */
  useEffect(() => {
    loadGoogleMaps()
      .then(() => setMapsLoaded(true))
      .catch(() => setNoApiKey(true));
  }, []);

  /* ── Reverse geocode a latlng ── */
  const reverseGeocode = useCallback(
    (lat: number, lng: number) => {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const result = results[0];
          const components = result.address_components || [];

          let area = "";
          let city = "";
          for (const c of components) {
            if (c.types.includes("sublocality") || c.types.includes("neighborhood")) area = c.long_name;
            if (c.types.includes("locality")) city = c.long_name;
            if (!city && c.types.includes("administrative_area_level_1")) city = c.long_name;
          }

          onChangeRef.current({
            ...valueRef.current,
            formatted_address: result.formatted_address,
            lat,
            lng,
            place_id: result.place_id || "",
            area,
            city: city || "Dubai",
          });

          if (inputRef.current) {
            inputRef.current.value = result.formatted_address;
          }
        }
      });
    },
    []
  );

  /* ── Initialize map + autocomplete ── */
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || !inputRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    const center = value.lat && value.lng
      ? { lat: value.lat, lng: value.lng }
      : DUBAI_CENTER;

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: value.lat ? 16 : 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "simplified" }] },
      ],
      restriction: {
        latLngBounds: UAE_BOUNDS,
        strictBounds: false,
      },
    });

    const marker = new google.maps.Marker({
      map,
      position: value.lat ? center : undefined,
      draggable: true,
      animation: google.maps.Animation.DROP,
      visible: !!value.lat,
    });

    // Draggable marker → reverse geocode
    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (pos) {
        reverseGeocode(pos.lat(), pos.lng());
      }
    });

    // Click map → move pin
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        marker.setPosition(e.latLng);
        marker.setVisible(true);
        map.panTo(e.latLng);
        reverseGeocode(e.latLng.lat(), e.latLng.lng());
      }
    });

    // Autocomplete
    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "ae" },
      fields: ["formatted_address", "geometry", "place_id", "address_components"],
      types: ["address"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) return;

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const components = place.address_components || [];

      let area = "";
      let city = "";
      for (const c of components) {
        if (c.types.includes("sublocality") || c.types.includes("neighborhood")) area = c.long_name;
        if (c.types.includes("locality")) city = c.long_name;
        if (!city && c.types.includes("administrative_area_level_1")) city = c.long_name;
      }

      marker.setPosition({ lat, lng });
      marker.setVisible(true);
      map.setCenter({ lat, lng });
      map.setZoom(16);

      onChangeRef.current({
        ...valueRef.current,
        formatted_address: place.formatted_address || "",
        lat,
        lng,
        place_id: place.place_id || "",
        area,
        city: city || "Dubai",
      });
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    autocompleteRef.current = autocomplete;
  }, [mapsLoaded, reverseGeocode, value.lat, value.lng]);

  /* ── Field change handler ── */
  function updateField(field: keyof AddressDetails, val: string) {
    onChange({ ...value, [field]: val });
  }

  /* ── Fallback: no API key → simple text input ── */
  if (noApiKey) {
    return (
      <div className="space-y-5">
        <div>
          <label htmlFor="book-address" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
            Service Address
          </label>
          <input
            id="book-address"
            type="text"
            value={value.formatted_address}
            onChange={(e) => updateField("formatted_address", e.target.value)}
            placeholder="Villa 42, Street 12, Al Barsha 2, Dubai"
            className={INPUT}
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
        <StructuredFields value={value} updateField={updateField} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search + Map */}
      <div>
        <label htmlFor="book-address" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
          Service Address
        </label>
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="rgb(170,175,185)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            id="book-address"
            type="text"
            defaultValue={value.formatted_address}
            placeholder="Search for your address..."
            className={INPUT}
            style={{ fontFamily: "var(--font-body)", paddingLeft: "44px" }}
          />
        </div>

        {/* Map container */}
        <div
          ref={mapRef}
          className="mt-3 rounded-[12px] border-2 border-[rgb(230,230,230)] overflow-hidden"
          style={{ height: 280, background: "rgb(245,246,248)" }}
        >
          {!mapsLoaded && (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
            </div>
          )}
        </div>

        <p
          className="text-[12px] mt-2"
          style={{ fontFamily: "var(--font-body)", color: "rgb(170,175,185)" }}
        >
          Search or click the map to pin your exact location. Drag the pin to adjust.
        </p>
      </div>

      {/* Structured fields */}
      <StructuredFields value={value} updateField={updateField} />
    </div>
  );
}

/* ─── Structured Address Fields ─────────────────────────────────────── */

function StructuredFields({
  value,
  updateField,
}: {
  value: AddressDetails;
  updateField: (field: keyof AddressDetails, val: string) => void;
}) {
  return (
    <div
      className="border-t-2 border-[rgb(244,244,244)] pt-5 mt-1 space-y-4"
    >
      <p
        className="text-[13px] font-medium"
        style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}
      >
        Help our team find you
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="book-building" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
            Building / Villa Name
          </label>
          <input
            id="book-building"
            type="text"
            value={value.building_name}
            onChange={(e) => updateField("building_name", e.target.value)}
            placeholder="e.g. Marina Tower 3, Villa 42"
            className={INPUT}
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
        <div>
          <label htmlFor="book-flat" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
            Flat / Unit Number
          </label>
          <input
            id="book-flat"
            type="text"
            value={value.flat_number}
            onChange={(e) => updateField("flat_number", e.target.value)}
            placeholder="e.g. Apt 1204, Unit B"
            className={INPUT}
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="book-floor" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
            Floor
          </label>
          <input
            id="book-floor"
            type="text"
            value={value.floor}
            onChange={(e) => updateField("floor", e.target.value)}
            placeholder="e.g. 12, Ground, Basement"
            className={INPUT}
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
        <div>
          <label htmlFor="book-area" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
            Area / Neighborhood
          </label>
          <input
            id="book-area"
            type="text"
            value={value.area}
            onChange={(e) => updateField("area", e.target.value)}
            placeholder="Auto-filled from map"
            className={INPUT}
            style={{ fontFamily: "var(--font-body)" }}
            readOnly={!!value.lat}
          />
        </div>
      </div>

      <div>
        <label htmlFor="book-directions" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
          Additional Directions
        </label>
        <textarea
          id="book-directions"
          value={value.additional_directions}
          onChange={(e) => updateField("additional_directions", e.target.value)}
          placeholder="e.g. Enter from Gate 3, turn left past the guard booth. Ring doorbell twice."
          rows={3}
          maxLength={500}
          className={`${INPUT} resize-none`}
          style={{ fontFamily: "var(--font-body)" }}
        />
        <p
          className="text-[11px] mt-1 text-right"
          style={{ fontFamily: "var(--font-body)", color: "rgb(190,195,205)" }}
        >
          {value.additional_directions.length}/500
        </p>
      </div>
    </div>
  );
}
