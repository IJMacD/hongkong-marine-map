import L from "leaflet";

const BUTTON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 7h11.17l-1.59-1.59L15 4l5 5-5 5-1.41-1.41L15.17 11H4V7zm16 10H8.83l1.59 1.59L9 20l-5-5 5-5 1.41 1.41L8.83 13H20v4z"/></svg>';

type TidesControlOptions = L.ControlOptions & {
  onToggle: () => void;
};

export class TidesControl extends L.Control {
  private button: HTMLAnchorElement | undefined;
  private onToggle: () => void;
  private active = false;

  constructor(options: TidesControlOptions) {
    super({ position: "topleft", ...options });
    this.onToggle = options.onToggle;
  }

  onAdd(): HTMLElement {
    const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control-tides");
    const button = L.DomUtil.create("a", "leaflet-control-tides-button", bar) as HTMLAnchorElement;
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
    const title = this.active ? "Hide tidal streams" : "Show tidal streams";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.setAttribute("aria-pressed", this.active ? "true" : "false");
    button.classList.toggle("is-active", this.active);
  }
}
