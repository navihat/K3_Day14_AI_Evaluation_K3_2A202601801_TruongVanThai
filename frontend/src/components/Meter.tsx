import { band, bandLabel, bandVar, f3 } from "../format";

interface Props {
  label: string;
  value: number;
  note: string;
}

/** A single metric readout. The band is encoded as colour AND as a written
 *  label, so the status never depends on colour alone. */
export function Meter({ label, value, note }: Props) {
  const b = band(value);
  return (
    <div className="meter">
      <div className="row1">
        <span className="lab">{label}</span>
        <span className="num">{f3(value)}</span>
      </div>
      <div className="bar">
        <i style={{ width: `${(value * 100).toFixed(1)}%`, background: bandVar(b) }} />
        <span className="tick" style={{ left: "60%" }} />
        <span className="tick" style={{ left: "80%" }} />
      </div>
      <div className="row2">
        <i className="dot" style={{ background: bandVar(b) }} />
        <span>{bandLabel[b]}</span>
        <span>· {note}</span>
      </div>
    </div>
  );
}
