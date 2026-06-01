interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
}: QuantityStepperProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  const btn =
    'flex h-10 w-10 items-center justify-center text-lg text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent';

  return (
    <div className="inline-flex items-center rounded-full border border-gray-200 bg-white">
      <button
        type="button"
        onClick={dec}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
        className={`${btn} rounded-l-full`}
      >
        −
      </button>
      <span className="w-10 text-center text-sm font-medium tabular-nums text-gray-950" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
        className={`${btn} rounded-r-full`}
      >
        +
      </button>
    </div>
  );
}
