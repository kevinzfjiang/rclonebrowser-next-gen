import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  closeDisabled?: boolean;
  maxWidthClass?: string;
  zIndexClass?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  closeDisabled = false,
  maxWidthClass = 'max-w-lg',
  zIndexClass = 'z-50',
  children,
  ariaLabel,
}) => {
  useEffect(() => {
    if (!isOpen || closeDisabled || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeDisabled, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={(e) => {
        if (!closeDisabled && onClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/65 backdrop-blur-sm p-4`}
    >
      <div
        className={`bg-slate-900 border border-slate-800 rounded-2xl w-full ${maxWidthClass} shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-modal-in`}
      >
        {children}
      </div>
    </div>
  );
};
