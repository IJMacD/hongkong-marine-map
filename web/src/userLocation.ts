export type UserPosition = {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
};

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type DeviceOrientationWithCompass = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 10_000,
};

export function isGeolocationAvailable(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

export function watchUserPosition(
  onPosition: (position: UserPosition) => void,
  onError: (error: GeolocationPositionError | Error) => void,
): () => void {
  if (!isGeolocationAvailable()) {
    onError(new Error("Geolocation is not available"));
    return () => {};
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy, heading } = pos.coords;
      onPosition({
        lat: latitude,
        lng: longitude,
        accuracy,
        heading: finiteHeading(heading),
      });
    },
    onError,
    WATCH_OPTIONS,
  );

  return () => navigator.geolocation.clearWatch(id);
}

export async function watchHeading(onHeading: (heading: number) => void): Promise<() => void> {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
    return () => {};
  }

  const request = (DeviceOrientationEvent as DeviceOrientationEventWithPermission).requestPermission;
  if (typeof request === "function") {
    try {
      const result = await request.call(DeviceOrientationEvent);
      if (result !== "granted") return () => {};
    } catch {
      return () => {};
    }
  }

  const handler = (event: Event) => {
    const heading = headingFromOrientation(event as DeviceOrientationWithCompass);
    if (heading != null) onHeading(heading);
  };

  const eventName: "deviceorientationabsolute" | "deviceorientation" =
    "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";

  window.addEventListener(eventName, handler, true);
  return () => window.removeEventListener(eventName, handler, true);
}

export function resolveHeading(gpsHeading: number | null, compassHeading: number | null): number | null {
  return gpsHeading ?? compassHeading;
}

function finiteHeading(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return normalizeHeading(value);
}

function headingFromOrientation(event: DeviceOrientationWithCompass): number | null {
  if (typeof event.webkitCompassHeading === "number" && Number.isFinite(event.webkitCompassHeading)) {
    return normalizeHeading(event.webkitCompassHeading);
  }
  if (event.absolute && event.alpha != null && Number.isFinite(event.alpha)) {
    return normalizeHeading(360 - event.alpha + screenAngle());
  }
  return null;
}

function screenAngle(): number {
  const orientation = window.screen?.orientation;
  if (orientation && typeof orientation.angle === "number") return orientation.angle;
  const legacy = (window as Window & { orientation?: number }).orientation;
  return typeof legacy === "number" ? legacy : 0;
}

function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}
