export default function Tooltip({
  content,
  children,
  disabled = false,
  className = '',
}) {
  if (disabled || !content) {
    return children;
  }

  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-max max-w-[230px] -translate-x-1/2 translate-y-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-center text-[11px] leading-[1.35] text-white opacity-0 invisible transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
        role="tooltip"
      >
        {content}
      </span>
    </span>
  );
}
