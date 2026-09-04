import L from "leaflet";

const BUTTON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>';

type HistoryControlOptions = L.ControlOptions & {
  onToggle: () => void;
};

export class HistoryControl extends L.Control {
  private button: HTMLAnchorElement | undefined;
  private onToggle: () => void;
  private active = false;

  constructor(options: HistoryControlOptions) {
    super({ position: "topleft", ...options });
    this.onToggle = options.onToggle;
  }

  onAdd(): HTMLElement {
    const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control-history");
    const button = L.DomUtil.create("a", "leaflet-control-history-button", bar) as HTMLAnchorElement;
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
    const title = this.active ? "Hide chart history" : "Show chart history";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.setAttribute("aria-pressed", this.active ? "true" : "false");
    button.classList.toggle("is-active", this.active);
  }
}
