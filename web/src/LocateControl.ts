import L from "leaflet";
import {
  isGeolocationAvailable,
  resolveHeading,
  watchHeading,
  watchUserPosition,
  type UserPosition,
} from "./userLocation";

export type LocateState = "idle" | "locating" | "following" | "off-center" | "error";

const ICON_HTML =
  '<div class="user-location-heading-wrap is-hidden"><div class="user-location-heading"></div></div><div class="user-location-dot"></div>';

const BUTTON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>';

const TITLES: Record<LocateState, string> = {
  idle: "Show my location",
  locating: "Finding your location…",
  following: "Stop showing location",
  "off-center": "Center on my location",
  error: "Location unavailable — try again",
};

export class LocateControl extends L.Control {
  private mapRef: L.Map | undefined;
  private button: HTMLAnchorElement | undefined;
  private state: LocateState = "idle";
  private stopPosition: (() => void) | undefined;
  private stopHeading: (() => void) | undefined;
  private marker: L.Marker | undefined;
  private circle: L.Circle | undefined;
  private headingEl: HTMLElement | null = null;
  private lastPosition: UserPosition | undefined;
  private compassHeading: number | null = null;

  constructor(options?: L.ControlOptions) {
    super({ position: "topleft", ...options });
  }

  onAdd(map: L.Map): HTMLElement {
    this.mapRef = map;
    const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control-locate");
    const button = L.DomUtil.create("a", "leaflet-control-locate-button", bar) as HTMLAnchorElement;
    button.href = "#";
    button.role = "button";
    button.innerHTML = BUTTON_SVG;
    this.button = button;
    this.setState("idle");

    L.DomEvent.disableClickPropagation(bar);
    L.DomEvent.disableScrollPropagation(bar);
    L.DomEvent.on(button, "click", L.DomEvent.stop);
    L.DomEvent.on(button, "click", this.onClick);

    map.on("dragstart", this.dropFollow);
    map.on("zoomstart", this.dropFollow);
    map.on("requestlocate", this.onRequestLocate);
    return bar;
  }

  onRemove(map: L.Map): void {
    if (this.button) L.DomEvent.off(this.button, "click", this.onClick);
    map.off("dragstart", this.dropFollow);
    map.off("zoomstart", this.dropFollow);
    map.off("requestlocate", this.onRequestLocate);
    this.stop();
    this.mapRef = undefined;
    this.button = undefined;
  }

  private onClick = (): void => {
    if (this.state === "following") {
      this.stop();
      return;
    }
    if (this.state === "off-center" && this.lastPosition) {
      this.panTo(this.lastPosition, true);
      return;
    }
    this.start();
  };

  private start(): void {
    if (!isGeolocationAvailable()) {
      this.setState("error");
      return;
    }
    this.stopWatchers();
    this.setState("locating");
    this.stopPosition = watchUserPosition(this.onPosition, this.onError);
    void watchHeading((heading) => {
      this.compassHeading = heading;
      this.applyHeading();
    }).then((stop) => {
      if (this.state === "idle" || this.state === "error") {
        stop();
        return;
      }
      this.stopHeading = stop;
    });
  }

  private stop(): void {
    this.stopWatchers();
    this.marker?.remove();
    this.circle?.remove();
    this.marker = undefined;
    this.circle = undefined;
    this.headingEl = null;
    this.lastPosition = undefined;
    this.compassHeading = null;
    this.setState("idle");
    this.mapRef?.fire("userpositionend");
  }

  private emitPosition(): void {
    const map = this.mapRef;
    const position = this.lastPosition;
    if (!map || !position) return;
    map.fire("userposition", { position });
  }

  private onRequestLocate = (): void => {
    if (this.lastPosition) this.emitPosition();
    if (this.state === "idle" || this.state === "error") this.start();
  };

  private stopWatchers(): void {
    this.stopPosition?.();
    this.stopHeading?.();
    this.stopPosition = undefined;
    this.stopHeading = undefined;
  }

  private onPosition = (position: UserPosition): void => {
    const map = this.mapRef;
    if (!map) return;
    this.lastPosition = position;
    const latlng = L.latLng(position.lat, position.lng);

    if (!this.marker) {
      const icon = L.divIcon({
        className: "user-location-icon",
        html: ICON_HTML,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      });
      this.marker = L.marker(latlng, {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(map);
      this.headingEl = this.marker.getElement()?.querySelector(".user-location-heading-wrap") ?? null;
    } else {
      this.marker.setLatLng(latlng);
    }

    if (!this.circle) {
      this.circle = L.circle(latlng, {
        radius: Math.max(position.accuracy, 1),
        color: "#7eb8da",
        weight: 1,
        opacity: 0.7,
        fillColor: "#7eb8da",
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(map);
    } else {
      this.circle.setLatLng(latlng);
      this.circle.setRadius(Math.max(position.accuracy, 1));
    }

    this.applyHeading();
    this.emitPosition();

    if (this.state === "locating" || this.state === "following") {
      this.panTo(position, this.state === "locating");
    }
  };

  private onError = (error: GeolocationPositionError | Error): void => {
    const denied =
      "code" in error && error.code === 1 /* PERMISSION_DENIED */;
    const timeout = "code" in error && error.code === 3 /* TIMEOUT */;
    if (timeout && this.lastPosition) return;
    if (denied || !this.lastPosition) {
      this.stopWatchers();
      this.setState("error");
    }
  };

  private panTo(position: UserPosition, animate: boolean): void {
    const map = this.mapRef;
    if (!map) return;
    const latlng = L.latLng(position.lat, position.lng);
    const maxBounds = map.options.maxBounds as L.LatLngBounds | undefined;
    if (maxBounds && !maxBounds.contains(latlng)) {
      this.setState("off-center");
      return;
    }
    map.setView(latlng, map.getZoom(), { animate });
    this.setState("following");
  }

  private dropFollow = (): void => {
    if (this.state === "following") this.setState("off-center");
  };

  private applyHeading(): void {
    if (!this.headingEl) {
      this.headingEl = this.marker?.getElement()?.querySelector(".user-location-heading-wrap") ?? null;
    }
    const heading = resolveHeading(this.lastPosition?.heading ?? null, this.compassHeading);
    const el = this.headingEl;
    if (!el) return;
    if (heading == null) {
      el.classList.add("is-hidden");
      return;
    }
    el.classList.remove("is-hidden");
    el.style.transform = `rotate(${heading}deg)`;
  }

  private setState(state: LocateState): void {
    this.state = state;
    this.mapRef?.fire("locatestate", { state });
    const button = this.button;
    if (!button) return;
    button.title = TITLES[state];
    button.setAttribute("aria-label", TITLES[state]);
    button.classList.toggle("is-locating", state === "locating");
    button.classList.toggle("is-following", state === "following");
    button.classList.toggle("is-off-center", state === "off-center");
    button.classList.toggle("is-error", state === "error");
  }
}
