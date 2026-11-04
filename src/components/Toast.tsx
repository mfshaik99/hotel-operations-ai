import React from 'react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="toast-container" aria-live="polite">
      <div className="toast">
        {message}
      </div>
    </div>
  );
};
