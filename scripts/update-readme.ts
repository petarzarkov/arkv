/**
 * Updates the "Packages" table and "Project Structure"
 * code block in the root README.md by reading every
 * packages/<name>/package.json in the workspace.
 *
 * Usage:
 *   bun ./scripts/update-readme.ts
 *   bun run gen:readme
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const PACKAGES_DIR = join(ROOT, 'packages');
const README_PATH = join(ROOT, 'README.md');

interface PackageJson {
  name: string;
  version: string;
  description?: string;
  private?: boolean;
}

function readPkg(folder: string): PackageJson | null {
  const pkgPath = join(
    PACKAGES_DIR,
    folder,
    'package.json',
  );
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(
      readFileSync(pkgPath, 'utf8'),
    ) as PackageJson;
  } catch {
    return null;
  }
}

interface PackageEntry {
  folder: string;
  pkg: PackageJson;
}

function discoverPackages(): PackageEntry[] {
  return readdirSync(PACKAGES_DIR, {
    withFileTypes: true,
  })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(d => {
      const pkg = readPkg(d.name);
      return pkg ? [{ folder: d.name, pkg }] : [];
    });
}

function npmBadge(name: string): string {
  const encoded = encodeURIComponent(name);
  const shield = `https://img.shields.io/npm/v/${encoded}`;
  const npmUrl = `https://www.npmjs.com/package/${encoded}`;
  return `[![npm](${shield})](${npmUrl})`;
}

function buildPackagesTable(
  entries: PackageEntry[],
): string {
  const header = '| Package | Version | Description |';
  const divider = '|---------|---------|-------------|';

  const rows = entries
    .filter(e => !e.pkg.private)
    .map(({ folder, pkg }) => {
      const link = `[\`${pkg.name}\`](./packages/${folder})`;
      const badge = npmBadge(pkg.name);
      const desc = pkg.description ?? '';
      return `| ${link} | ${badge} | ${desc} |`;
    });

  return [header, divider, ...rows].join('\n');
}

type TreeNode = {
  prefix: string;
  branch: string;
  name: string;
  comment: string;
};

function buildProjectStructure(
  entries: PackageEntry[],
): string {
  const lastPkg = entries.length - 1;
  const pkgNodes: TreeNode[] = entries.map(
    ({ folder, pkg }, i) => ({
      prefix: '│   ',
      branch: i === lastPkg ? '└── ' : '├── ',
      name: folder,
      // Split on '. ' to avoid breaking "Day.js"
      comment: pkg.description
        ? (pkg.description.split('. ')[0] ?? pkg.name)
        : pkg.name,
    }),
  );

  const topDefs: [string, string, string][] = [
    ['├── ', 'packages/', 'Published packages'],
    ['├── ', 'scripts/', 'Monorepo-level scripts'],
    ['├── ', '.github/workflows/', 'CI/CD pipeline'],
    ['└── ', '.husky/', 'Git hooks'],
  ];
  const topNodes: TreeNode[] = topDefs.map(
    ([branch, name, comment]) => ({
      prefix: '',
      branch,
      name,
      comment,
    }),
  );

  // Compute max key length across all nodes for alignment
  const allNodes = [...topNodes, ...pkgNodes];
  const maxKey = Math.max(
    ...allNodes.map(
      n =>
        n.prefix.length + n.branch.length + n.name.length,
    ),
  );

  const fmt = (n: TreeNode): string => {
    const key = `${n.prefix}${n.branch}${n.name}`;
    return `${key.padEnd(maxKey)}  # ${n.comment}`;
  };

  const [pkgsNode, ...restTop] = topNodes;
  const lines = [
    fmt(pkgsNode),
    ...pkgNodes.map(fmt),
    ...restTop.map(fmt),
  ];

  return ['```', 'arkv/', ...lines, '```'].join('\n');
}

/**
 * Replace the body of a markdown section.
 * Matches everything between the section header
 * and the next `## ` header (or end of file).
 */
function replaceSection(
  content: string,
  heading: string,
  newBody: string,
): string {
  const escaped = heading.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  const pattern = new RegExp(
    `(## ${escaped}\\n)([\\s\\S]*?)(?=\\n## |$)`,
  );
  return content.replace(pattern, `$1\n${newBody}\n`);
}

const entries = discoverPackages();

if (entries.length === 0) {
  console.error(
    'No packages found under packages/. Aborting.',
  );
  process.exit(1);
}

let readme = readFileSync(README_PATH, 'utf8');

readme = replaceSection(
  readme,
  'Packages',
  buildPackagesTable(entries),
);

readme = replaceSection(
  readme,
  'Project Structure',
  buildProjectStructure(entries),
);

writeFileSync(README_PATH, readme, 'utf8');

const names = entries.map(e => e.pkg.name).join(', ');
console.log(
  `Updated README.md with ${entries.length} packages:\n  ${names}`,
);
