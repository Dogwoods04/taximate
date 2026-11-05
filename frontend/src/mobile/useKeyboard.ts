import { useEffect, useState } from 'react';
import { isKeyboardOpen, onKeyboardChange } from '../lib/platform';

/** True while the on-screen keyboard is open (tracked on Android / other mobile; always false on iOS and PC). */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(isKeyboardOpen);
  useEffect(() => onKeyboardChange(setOpen), []);
  return open;
}
