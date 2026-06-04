import type { FontFamilyChoice, FontSettings } from "../types";

interface ToolFontControlsProps {
  fontSettings: FontSettings;
  setFontSettings: (next: FontSettings) => void;
  onFormatSelection?: (marker: string) => void;
}

const familyOptions: { value: FontFamilyChoice; label: string }[] = [
  { value: "screenplay", label: "Screenplay" },
  { value: "system", label: "System" },
  { value: "serif", label: "Serif" },
];

export function ToolFontControls({ fontSettings, setFontSettings, onFormatSelection }: ToolFontControlsProps) {
  const selectionTitle = onFormatSelection ? undefined : "Select editable text in Write or Rewrite to format it";
  return (
    <section className="tool-section">
      <h3>Text Style</h3>
      <label>
        Typeface
        <select
          name="font-family"
          value={fontSettings.family}
          onChange={(event) => setFontSettings({ ...fontSettings, family: event.target.value as FontFamilyChoice })}
        >
          {familyOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="format-toggle-row" role="toolbar" aria-label="Text formatting">
        <button
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFormatSelection?.("**")}
          type="button"
          disabled={!onFormatSelection}
          title={selectionTitle ?? "Bold selected text"}
        >
          B
        </button>
        <button
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFormatSelection?.("*")}
          type="button"
          disabled={!onFormatSelection}
          title={selectionTitle ?? "Italicize selected text"}
        >
          I
        </button>
        <button
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFormatSelection?.("_")}
          type="button"
          disabled={!onFormatSelection}
          title={selectionTitle ?? "Underline selected text"}
        >
          U
        </button>
      </div>
      <div className="font-control-row">
        <label>
          Size
          <input
            name="font-size"
            type="number"
            min={12}
            max={22}
            value={fontSettings.size}
            onChange={(event) => setFontSettings({ ...fontSettings, size: Number(event.target.value) })}
          />
        </label>
        <label>
          Spacing
          <select
            name="line-spacing"
            value={fontSettings.lineHeight}
            onChange={(event) => setFontSettings({ ...fontSettings, lineHeight: Number(event.target.value) })}
          >
            <option value={1.4}>Tight</option>
            <option value={1.6}>Normal</option>
            <option value={1.8}>Open</option>
          </select>
        </label>
      </div>
    </section>
  );
}
