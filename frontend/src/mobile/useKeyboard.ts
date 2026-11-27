import { useEffect, useState } from 'react';
import { isKeyboardOpen, onKeyboardChange } from '../lib/platform';

/** True while a mobile browser's visual viewport shrinks for a focused text input. */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(isKeyboardOpen);
  useEffect(() => onKeyboardChange(setOpen), []);
  return open;
}
