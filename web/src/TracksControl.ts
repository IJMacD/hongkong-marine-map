import L from "leaflet";

const BUTTON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0.5 3.5" d="M6 18c3-1 4-4 6-6s5-1 6-5"/><circle cx="5" cy="18.5" r="2" fill="currentColor"/><circle cx="19" cy="5.5" r="2" fill="currentColor"/></svg>';

type TracksControlOptions = L.ControlOptions & {
  onToggle: () => void;
};

export class TracksControl extends L.Control {
  private button: HTMLAnchorElement | undefined;
  private onToggle: () => void;
  private active = false;

  constructor(options: TracksControlOptions) {
    super({ position: "topleft", ...options });
    this.onToggle = options.onToggle;
  }

  onAdd(): HTMLElement {
    const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control-tracks");
    const button = L.DomUtil.create("a", "leaflet-control-tracks-button", bar) as HTMLAnchorElement;
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
    const title = this.active ? "Hide tracks" : "Show tracks";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.setAttribute("aria-pressed", this.active ? "true" : "false");
    button.classList.toggle("is-active", this.active);
  }
}
