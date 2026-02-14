import './tooltip.css';

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
    <span className={`tooltip-root ${className}`}>
      {children}
      <span className="tooltip-bubble" role="tooltip">
        {content}
      </span>
    </span>
  );
}
