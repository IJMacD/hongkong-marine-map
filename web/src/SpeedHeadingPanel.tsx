import { formatBearing, formatSpeedKnots } from "./geo";
import type { UserPosition } from "./userLocation";

type Props = {
  position: UserPosition;
};

export function SpeedHeadingPanel({ position }: Props) {
  const heading = position.heading == null ? "—" : formatBearing(position.heading);

  return (
    <div className="speed-heading-panel glass-panel">
      <div className="speed-heading-item">
        <span className="speed-heading-label">Speed</span>
        <strong className="speed-heading-value">{formatSpeedKnots(position.speed)}</strong>
      </div>
      <div className="speed-heading-item">
        <span className="speed-heading-label">Heading</span>
        <strong className="speed-heading-value">{heading}</strong>
      </div>
    </div>
  );
}
