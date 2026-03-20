type ButtonVariant = "primary" | "secondary" | "tertiary"

interface ButtonProps {
  onClick?: () => void
  children: React.ReactNode
  variant?: ButtonVariant
  isLoading?: boolean
  isDisabled?: boolean
  type?: "button" | "submit" | "reset"
  className?: string
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-lg rounded-lg shadow-lg",
  secondary:
    "px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold text-lg rounded-lg shadow-lg border border-white/20",
  tertiary: "text-white/50 hover:text-white/80 text-sm",
}

/**
 * Reusable button with primary, secondary, and tertiary variants.
 * Supports loading and disabled states.
 */
const Button = ({
  onClick,
  children,
  variant = "primary",
  isLoading = false,
  isDisabled = false,
  type = "button",
  className = "",
}: ButtonProps) => {
  const disabled = isDisabled || isLoading

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        relative transition-colors
        ${variantClasses[variant]}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
    >
      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <svg
            className="w-5 h-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </span>
      )}
      <span className={isLoading ? "invisible" : ""}>{children}</span>
    </button>
  )
}

export default Button
