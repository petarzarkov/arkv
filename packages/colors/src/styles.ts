import { ANSIPairs } from './ansi.js';
import { createColor } from './color.js';

// Style modifiers
export const bold = createColor(
  ANSIPairs.bold.open,
  ANSIPairs.bold.close,
);
export const dim = createColor(
  ANSIPairs.dim.open,
  ANSIPairs.dim.close,
);
export const italic = createColor(
  ANSIPairs.italic.open,
  ANSIPairs.italic.close,
);
export const underline = createColor(
  ANSIPairs.underline.open,
  ANSIPairs.underline.close,
);
export const strikethrough = createColor(
  ANSIPairs.strikethrough.open,
  ANSIPairs.strikethrough.close,
);
export const inverse = createColor(
  ANSIPairs.reverse.open,
  ANSIPairs.reverse.close,
);
export const hidden = createColor(
  ANSIPairs.hidden.open,
  ANSIPairs.hidden.close,
);
