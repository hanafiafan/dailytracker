import { useState } from "react";
import { Pipette } from "lucide-react";
import { COLORS, type Color } from "@shared/schemas";
import { COLOR_LABEL, colorHex } from "../lib/tasks";

export function ColorPicker({
  value: controlledValue,
  defaultValue = "lilac",
  onChange: controlledOnChange,
  name,
  compact = false,
  className = "",
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (c: string) => void;
  name?: string;
  compact?: boolean;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [showHexInput, setShowHexInput] = useState(false);

  const value = controlledValue !== undefined ? controlledValue : internalValue;
  const onChange = (c: string) => {
    setInternalValue(c);
    controlledOnChange?.(c);
  };

  const currentHex = colorHex(value);
  const isCustom = !(COLORS as readonly string[]).includes(value);

  return (
    <div className={`color-picker-wrap ${compact ? "compact" : ""} ${className}`.trim()}>
      {name && <input type="hidden" name={name} value={value} />}

      {/* Preset and Custom Swatches */}
      <div className="color-swatches" role="radiogroup" aria-label="Pilih Warna">
        {COLORS.map(c => {
          const isSelected = value === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={COLOR_LABEL[c]}
              title={COLOR_LABEL[c]}
              data-c={c}
              onClick={() => onChange(c)}
              className={"color-swatch-btn" + (isSelected ? " selected" : "")}
              style={{
                background: `var(--c-${c})`,
              }}
            />
          );
        })}

        {/* Custom Color Native Trigger (HTML5 color picker + Eye Dropper) */}
        <label
          className={"color-swatch-custom" + (isCustom ? " selected" : "")}
          title="Pilih warna kustom (RGB / HEX)"
          style={isCustom ? { background: currentHex } : undefined}
        >
          <input
            type="color"
            value={currentHex}
            onChange={e => onChange(e.target.value)}
            className="color-native-input"
            aria-label="Pilih warna kustom RGB"
          />
          <Pipette size={13} style={{ color: isCustom ? "#fff" : "var(--ink)", filter: isCustom ? "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" : undefined }} />
        </label>
      </div>

      {/* Custom RGB / HEX text input and indicator */}
      {!compact && (
        <div className="color-custom-row">
          <div className="color-preview-badge" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className="color-preview-dot"
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: isCustom ? value : `var(--c-${value})`,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: ".82rem", fontWeight: 600, color: "var(--ink)" }}>
              {isCustom ? value.toUpperCase() : COLOR_LABEL[value as Color] || value}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className="linkbtn"
              style={{ fontSize: ".76rem" }}
              onClick={() => setShowHexInput(v => !v)}
            >
              {showHexInput ? "Tutup input HEX" : "Ketik HEX / RGB"}
            </button>
          </div>
        </div>
      )}

      {showHexInput && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <input
            className="input"
            style={{ fontSize: ".82rem", padding: "4px 8px", height: 32 }}
            placeholder="#3B82F6 atau rgb(59, 130, 246)"
            value={value}
            onChange={e => onChange(e.target.value.trim())}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
