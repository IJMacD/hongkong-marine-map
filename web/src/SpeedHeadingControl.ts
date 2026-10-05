import L from "leaflet";

const BUTTON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"/></svg>';

type SpeedHeadingControlOptions = L.ControlOptions & {
  onToggle: () => void;
};

export class SpeedHeadingControl extends L.Control {
  private bar: HTMLElement | undefined;
  private button: HTMLAnchorElement | undefined;
  private onToggle: () => void;
  private active = false;
  private available = false;

  constructor(options: SpeedHeadingControlOptions) {
    super({ position: "topleft", ...options });
    this.onToggle = options.onToggle;
  }

  onAdd(): HTMLElement {
    const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control-motion");
    const button = L.DomUtil.create("a", "leaflet-control-motion-button", bar) as HTMLAnchorElement;
    button.href = "#";
    button.role = "button";
    button.innerHTML = BUTTON_SVG;
    this.bar = bar;
    this.button = button;
    this.applyAvailable();
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
    this.bar = undefined;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.applyActive();
  }

  setAvailable(available: boolean): void {
    this.available = available;
    this.applyAvailable();
  }

  private handleClick = (): void => {
    if (!this.available) return;
    this.onToggle();
  };

  private applyAvailable(): void {
    this.bar?.classList.toggle("is-unavailable", !this.available);
  }

  private applyActive(): void {
    const button = this.button;
    if (!button) return;
    const title = this.active ? "Hide speed and heading" : "Show speed and heading";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.setAttribute("aria-pressed", this.active ? "true" : "false");
    button.classList.toggle("is-active", this.active);
  }
}
