import { forwardRef, type SVGProps } from "react";

/** Compact scan-frame barcode for nav and page headers. */
export const BarcodeScanIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  function BarcodeScanIcon({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        aria-hidden="true"
        {...props}
      >
        <path
          d="M4 8V6.5A1.5 1.5 0 0 1 5.5 5H8M20 8V6.5A1.5 1.5 0 0 0 18.5 5H16M4 16v1.5A1.5 1.5 0 0 0 5.5 19H8M20 16v1.5a1.5 1.5 0 0 1-1.5 1.5H16"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g fill="currentColor">
          <rect x="6.4" y="7.25" width="1.2" height="9.5" rx="0.25" />
          <rect x="8.15" y="7.25" width="0.7" height="9.5" rx="0.2" />
          <rect x="9.4" y="7.25" width="1.55" height="9.5" rx="0.25" />
          <rect x="11.5" y="7.25" width="0.7" height="9.5" rx="0.2" />
          <rect x="12.75" y="7.25" width="1.9" height="9.5" rx="0.25" />
          <rect x="15.2" y="7.25" width="0.7" height="9.5" rx="0.2" />
          <rect x="16.45" y="7.25" width="1.15" height="9.5" rx="0.25" />
        </g>
      </svg>
    );
  },
);
