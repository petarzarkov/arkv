export const FORMAT_DEFAULT = 'YYYY-MM-DDTHH:mm:ssZ';

export const INVALID_DATE = 'Invalid Date';

// Matches format tokens and [escaped] text
export const REGEX_FORMAT =
  /\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g;
