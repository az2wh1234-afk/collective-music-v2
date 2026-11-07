import { NUMERIC_FIELDS, type Config } from '../lib/config';
export function ConfigForm({ value, onChange, disabled }: { value: Config; onChange: (c: Config) => void; disabled?: boolean }) {
  const groups = Array.from(new Set(NUMERIC_FIELDS.map(f => f.group)));
  return (
    <div className="cfg">
      {groups.map(g => (
        <fieldset key={g} disabled={disabled}>
          <legend>{g}</legend>
          {NUMERIC_FIELDS.filter(f => f.group === g).map(f => (
            <label key={f.key} className="cfgRow">
              <span>{f.label}</span>
              <input type="range" min={f.min} max={f.max} step={f.step} value={value[f.key] as number} onChange={e => onChange({ ...value, [f.key]: Number(e.target.value) })} />
              <input type="number" min={f.min} max={f.max} step={f.step} value={value[f.key] as number} onChange={e => onChange({ ...value, [f.key]: Number(e.target.value) })} />
            </label>
          ))}
          {g === 'Light' && (
            <div className="cfgColors">
              <label>Layer 01 colour <input type="color" value={value.color0} onChange={e => onChange({ ...value, color0: e.target.value })} /></label>
              <label>Layer 02 colour <input type="color" value={value.color1} onChange={e => onChange({ ...value, color1: e.target.value })} /></label>
            </div>
          )}
        </fieldset>
      ))}
    </div>
  );
}
