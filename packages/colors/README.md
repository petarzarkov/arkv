# @arkv/colors

Lightweight, zero-dependency ANSI color and style utilities for terminals.

## Install

```bash
bun add @arkv/colors
# or
npm install @arkv/colors
```

## Usage

### Basic Colors

```typescript
import { red, green, blue, yellow } from '@arkv/colors';

console.log(red('Error!'));
console.log(green('Success'));
console.log(blue('Info'));
console.log(yellow('Warning'));
```

### Style Modifiers

```typescript
import { bold, italic, underline, dim } from '@arkv/colors';

console.log(bold('Important'));
console.log(italic('Emphasis'));
console.log(underline('Underlined'));
```

### Composition

```typescript
import { compose, bold, red, underline } from '@arkv/colors';

const boldRed = compose(bold, red);
const critical = compose(bold, underline, red);

console.log(boldRed('Error'));
console.log(critical('Critical failure'));
```

### Factory (Custom Colors)

```typescript
import { createColor, createComposedColor, ANSIPairs } from '@arkv/colors';

// 256-color support
const orange = createColor('\x1b[38;5;208m', '\x1b[39m');

// Pre-composed bg + fg combo
const alertStyle = createComposedColor(ANSIPairs.bgRed, ANSIPairs.brightWhite);
```

### Color Detection

```typescript
import { isColorSupported, createConditionalColor, red } from '@arkv/colors';

if (isColorSupported()) {
  console.log(red('colored output'));
}

// Or wrap a color function to auto-detect
const safeRed = createConditionalColor(red);
console.log(safeRed('auto-detects terminal support'));
```

### Strip ANSI Codes

```typescript
import { strip, visibleLength, red } from '@arkv/colors';

strip(red('hello'));         // 'hello'
visibleLength(red('hello')); // 5
```

### Log Level Colors

```typescript
import { getLevelColorFn } from '@arkv/colors';

const colorFn = getLevelColorFn('error'); // returns red
console.log(colorFn('Something went wrong'));
```

## API

### Colors

| Function | Description |
|----------|-------------|
| `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white` | Standard foreground colors |
| `brightRed`, `brightGreen`, `brightYellow`, `brightBlue`, `brightMagenta`, `brightCyan`, `brightWhite` | Bright foreground colors |
| `bgBlack`, `bgRed`, `bgGreen`, `bgYellow`, `bgBlue`, `bgMagenta`, `bgCyan`, `bgWhite` | Background colors |
| `bgBrightRed` ... `bgBrightWhite` | Bright background colors |
| `gray` | Alias for dim |

### Styles

| Function | Description |
|----------|-------------|
| `bold` | Bold text |
| `dim` | Dimmed text |
| `italic` | Italic text |
| `underline` | Underlined text |
| `strikethrough` | Strikethrough text |
| `inverse` | Inverted colors |
| `hidden` | Hidden text |

### Utilities

| Function | Description |
|----------|-------------|
| `createColor(open, close)` | Create a custom color function |
| `createComposedColor(...pairs)` | Pre-compose multiple ANSI pairs |
| `compose(...fns)` | Compose color/style functions |
| `strip(text)` | Remove ANSI codes from text |
| `visibleLength(text)` | Get string length without ANSI codes |
| `isColorSupported()` | Check terminal color support |
| `createConditionalColor(fn)` | Wrap color fn with auto-detection |
| `getLevelColorFn(level)` | Get color fn for a log level |
| `getValueColor(value)` | Get color fn based on value type |

## Environment Variables

- `NO_COLOR` - Disable color output ([no-color.org](https://no-color.org/))
- `FORCE_COLOR` - Force color output regardless of TTY

## License

[MIT](../../LICENSE)
