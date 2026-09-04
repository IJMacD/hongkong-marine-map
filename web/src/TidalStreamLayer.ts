import L from "leaflet";
import type { TidalVector } from "./useTidalCurrents";

const SCALE = 10;
const CULL_MARGIN = 40;

function getTidalColour(value: number): string {
  if (value < 0.5) return "rgb(1 147 211)";
  if (value < 1.0) return "rgb(5 200 1)";
  if (value < 1.5) return "rgb(238 239 0)";
  if (value < 2.0) return "rgb(250 138 32)";
  if (value < 2.5) return "rgb(154 52 253)";
  return "rgb(255 45 46)";
}

export class TidalStreamLayer extends L.Layer {
  private canvas: HTMLCanvasElement | undefined;
  private field: TidalVector[] = [];

  onAdd(map: L.Map): this {
    const canvas = L.DomUtil.create("canvas", "tidal-stream-canvas") as HTMLCanvasElement;
    canvas.style.pointerEvents = "none";
    map.getPanes().overlayPane.appendChild(canvas);
    this.canvas = canvas;
    map.on("zoomend viewreset moveend resize", this.reset, this);
    this.reset();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off("zoomend viewreset moveend resize", this.reset, this);
    this.canvas?.remove();
    this.canvas = undefined;
    return this;
  }

  setField(field: TidalVector[]): void {
    this.field = field;
    this.redraw();
  }

  private reset = (): void => {
    const map = this._map;
    const canvas = this.canvas;
    if (!map || !canvas) return;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.x * dpr);
    canvas.height = Math.round(size.y * dpr);
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    this.redraw();
  };

  private redraw(): void {
    const map = this._map;
    const canvas = this.canvas;
    if (!map || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const point of this.field) {
      const pt = map.latLngToContainerPoint([point.lat, point.lon]);
      if (pt.x < -CULL_MARGIN || pt.y < -CULL_MARGIN || pt.x > width + CULL_MARGIN || pt.y > height + CULL_MARGIN) {
        continue;
      }

      const r = SCALE * point.magnitude * dpr;
      if (r < 0.5) continue;
      const t = r / 5;
      const direction = (point.direction * Math.PI) / 180;

      ctx.translate(pt.x * dpr, pt.y * dpr);
      ctx.rotate(direction + Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -2 * r);
      ctx.lineTo(0, r);
      ctx.moveTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.lineCap = "round";

      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2 * t;
      ctx.stroke();

      ctx.strokeStyle = getTidalColour(point.magnitude);
      ctx.lineWidth = t;
      ctx.stroke();
      ctx.resetTransform();
    }
  }
}
