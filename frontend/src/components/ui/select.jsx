import { IconChevronDown } from "@tabler/icons-react";

const DEFAULT_OPTIONS = ["United States", "Canada", "Mexico"];

function normalizeOption(option, index) {
  if (typeof option === "string") {
    return { label: option, value: option };
  }

  if (option && typeof option === "object") {
    const fallback = String(index);
    const value =
      option.value !== undefined && option.value !== null
        ? String(option.value)
        : fallback;
    const label =
      option.label !== undefined && option.label !== null
        ? String(option.label)
        : value;
    return { label, value };
  }

  const fallback = String(index);
  return { label: fallback, value: fallback };
}

export default function UiSelect({
  id = "location",
  name = "location",
  options = DEFAULT_OPTIONS,
  value,
  onChange,
  ariaLabel,
  className = "",
}) {
  const normalizedOptions = options.map(normalizeOption);
  const normalizedValue =
    value === undefined || value === null ? undefined : String(value);
  const selectProps =
    normalizedValue === undefined ? {} : { value: normalizedValue };

  return (
    <div className={`mt-2 grid grid-cols-1 ${className}`.trim()}>
      <select
        id={id}
        name={name}
        aria-label={ariaLabel}
        className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 sm:text-sm/6"
        onChange={onChange}
        {...selectProps}
      >
        {normalizedOptions.map((option, index) => (
          <option key={`${option.value}-${index}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <IconChevronDown
        aria-hidden="true"
        className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400"
      />
    </div>
  );
}
