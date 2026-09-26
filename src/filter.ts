const IGNORED_EXTENSIONS = new Set([
  "min.js",
  "min.css",
  "map",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "ico",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "pdf",
  "zip",
  "gz",
  "tar"
]);

const IGNORED_EXACT_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
  "cargo.lock",
  "gemfile.lock",
  "poetry.lock",
  "pipfile.lock"
]);

const IGNORED_DIRECTORY_PREFIXES = [
  "dist/",
  "build/",
  "out/",
  ".next/",
  "coverage/",
  ".angular/",
  ".cache/",
  "vendor/",
  "node_modules/"
];

export function isIgnoredFile(filepath: string): boolean {
  const normalized = filepath.trim().replace(/\\/g, "/");
  const basename = normalized.split("/").pop()?.toLowerCase() ?? "";

  if (IGNORED_EXACT_NAMES.has(basename)) return true;

  for (const prefix of IGNORED_DIRECTORY_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized.includes(`/${prefix}`)) return true;
  }

  for (const ext of IGNORED_EXTENSIONS) {
    if (basename.endsWith(`.${ext}`)) return true;
  }

  return false;
}

export function filterDiff(diffText: string): string {
  const lines = diffText.split(/\r?\n/);
  const output: string[] = [];
  let skippingCurrentFile = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      // Format: diff --git a/path/to/file b/path/to/file
      const match = line.match(/^diff --git a\/(.+?)\s+b\/(.+)$/);
      if (match) {
        const filePath = match[2];
        skippingCurrentFile = isIgnoredFile(filePath);
      } else {
        skippingCurrentFile = false;
      }
    }

    if (!skippingCurrentFile) {
      output.push(line);
    }
  }

  return output.join("\n");
}
