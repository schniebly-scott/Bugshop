import { useEffect, useState, type ReactNode } from 'react';

/** Button that needs a second click within a few seconds, for irreversible actions. */
export function ConfirmButton(props: {
  onConfirm(): void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  confirmLabel?: string;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <button
      type="button"
      className={`${props.className ?? ''} ${armed ? 'armed' : ''}`}
      disabled={props.disabled}
      title={props.title}
      onClick={() => {
        if (armed) {
          setArmed(false);
          props.onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? (props.confirmLabel ?? 'Click again to confirm') : props.children}
    </button>
  );
}
