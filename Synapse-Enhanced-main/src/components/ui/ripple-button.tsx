"use client";
import { useCallback, useRef, useState } from "react";

interface RippleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'gradient' | 'glass' | 'neon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function RippleButton({ 
  children, 
  variant = 'primary',
  size = 'md',
  className = '',
  ...props 
}: RippleButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
    xl: "px-10 py-5 text-xl"
  };

  const variantClasses = {
    primary: "bg-[#cbfe7e] text-[#0e352e] hover:text-white",
    secondary: "bg-slate-600 text-white hover:text-white",
    gradient: "bg-gradient-to-r from-primary via-purple-600 to-blue-600 text-white hover:text-white",
    glass: "bg-white/10 backdrop-blur-md border border-white/20 text-white hover:text-white",
    neon: "bg-transparent border-2 border-primary text-primary hover:text-white"
  };

  const createRipple = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isHovered || !buttonRef.current || !rippleRef.current) return;
      setIsHovered(true);

      const button = buttonRef.current;
      const ripple = rippleRef.current;
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = event.clientX - rect.left - size / 2;
      const y = event.clientY - rect.top - size / 2;

      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;

      ripple.classList.remove("ripple-leave");
      ripple.classList.add("ripple-enter");
    },
    [isHovered],
  );

  const removeRipple = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.target !== event.currentTarget) return;
    if (!buttonRef.current || !rippleRef.current) return;
    setIsHovered(false);

    const button = buttonRef.current;
    const ripple = rippleRef.current;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    ripple.classList.remove("ripple-enter");
    ripple.classList.add("ripple-leave");

    const handleAnimationEnd = () => {
      if (ripple) {
        ripple.classList.remove("ripple-leave");
        ripple.removeEventListener("animationend", handleAnimationEnd);
      }
    };

    ripple.addEventListener("animationend", handleAnimationEnd);
  }, []);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!buttonRef.current || !rippleRef.current || !isHovered) return;

      const button = buttonRef.current;
      const ripple = rippleRef.current;
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = event.clientX - rect.left - size / 2;
      const y = event.clientY - rect.top - size / 2;

      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
    },
    [isHovered],
  );

  return (
    <button
      ref={buttonRef}
      className={`font-semibold duration-[600ms] relative flex items-center justify-center overflow-hidden rounded-full transition ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      onMouseEnter={(e) => {
        if (e.target === e.currentTarget) {
          createRipple(e);
        }
      }}
      onMouseLeave={(e) => {
        if (e.target === e.currentTarget) {
          removeRipple(e);
        }
      }}
      onMouseMove={handleMouseMove}
      {...props}
    >
      <span className="relative z-[2]">{children}</span>
      <span ref={rippleRef} className="ripple" />
      <style>{`
        .ripple {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          background-color: #000000;
          z-index: 1;
          opacity: 0;
          transition: transform 50ms linear;
        }
        .ripple-enter {
          animation: ripple-enter 600ms ease-out forwards;
        }
        .ripple-leave {
          animation: ripple-leave 600ms ease-out forwards;
        }
        @keyframes ripple-enter {
          from { transform: scale(0); opacity: 1; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes ripple-leave {
          from { transform: scale(1); opacity: 1; }
          to { transform: scale(0); opacity: 1; }
        }
      `}</style>
    </button>
  );
} 