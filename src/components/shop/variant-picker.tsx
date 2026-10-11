import type { OptionState } from "@/lib/commerce";

export function VariantPicker({
  options,
  onSelect,
}: {
  options: OptionState[];
  onSelect: (name: string, value: string) => void;
}) {
  return options.map((option) => (
    <fieldset key={option.name}>
      <legend>{option.name}</legend>
      {option.values.map((value) => (
        <label key={value.name}>
          <input
            type="radio"
            name={option.name}
            value={value.name}
            checked={value.selected}
            // Focusable, so keyboard and screen reader users reach it and
            // hear why; choosing it says the combination isn't available.
            aria-disabled={!value.exists || undefined}
            onChange={() => onSelect(option.name, value.name)}
          />
          {value.name}
          {!value.exists
            ? " (unavailable)"
            : !value.available
              ? " (sold out)"
              : ""}
        </label>
      ))}
    </fieldset>
  ));
}
