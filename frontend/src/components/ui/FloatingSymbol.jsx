// One code symbol that floats slowly in the background of the welcome screen.
export default function FloatingSymbol({ symbol, style, duration = 6, delay = 0 }) {
  return (
    <span
      className="floating-symbol"
      aria-hidden="true"
      style={{ ...style, animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
    >
      {symbol}
    </span>
  );
}
