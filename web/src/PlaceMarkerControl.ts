import L from "leaflet";

const BUTTON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>';

type PlaceMarkerControlOptions = L.ControlOptions & {
  onToggle: () => void;
};

export class PlaceMarkerControl extends L.Control {
  private button: HTMLAnchorElement | undefined;
  private onToggle: () => void;
  private active = false;

  constructor(options: PlaceMarkerControlOptions) {
    super({ position: "topleft", ...options });
    this.onToggle = options.onToggle;
  }

  onAdd(): HTMLElement {
    const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control-place");
    const button = L.DomUtil.create("a", "leaflet-control-place-button", bar) as HTMLAnchorElement;
    button.href = "#";
    button.role = "button";
    button.innerHTML = BUTTON_SVG;
    this.button = button;
    this.applyActive();

    L.DomEvent.disableClickPropagation(bar);
    L.DomEvent.disableScrollPropagation(bar);
    L.DomEvent.on(button, "click", L.DomEvent.stop);
    L.DomEvent.on(button, "click", this.handleClick);
    return bar;
  }

  onRemove(): void {
    if (this.button) L.DomEvent.off(this.button, "click", this.handleClick);
    this.button = undefined;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.applyActive();
  }

  private handleClick = (): void => {
    this.onToggle();
  };

  private applyActive(): void {
    const button = this.button;
    if (!button) return;
    const title = this.active ? "Cancel placing marker" : "Place a marker";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.setAttribute("aria-pressed", this.active ? "true" : "false");
    button.classList.toggle("is-active", this.active);
  }
}
