export interface RepositoryStack {
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
}

const rules: Array<[string, string, "language" | "framework" | "packageManager"]> = [
  ["package.json", "JavaScript/TypeScript", "language"],
  ["tsconfig.json", "TypeScript", "language"],
  ["angular.json", "Angular", "framework"],
  ["next.config.js", "Next.js", "framework"],
  ["next.config.ts", "Next.js", "framework"],
  ["vite.config.ts", "Vite", "framework"],
  ["pom.xml", "Maven", "packageManager"],
  ["build.gradle", "Gradle", "packageManager"],
  ["go.mod", "Go", "language"],
  ["Cargo.toml", "Rust", "language"],
  ["requirements.txt", "Python", "language"],
  ["pyproject.toml", "Python", "language"],
  ["*.csproj", "C#", "language"],
  ["*.sln", ".NET", "framework"],
  ["Dockerfile", "Docker", "framework"],
];

export function detectStack(paths: string[]): RepositoryStack {
  const result: RepositoryStack = { languages: [], frameworks: [], packageManagers: [] };

  for (const path of paths) {
    const name = path.split("/").pop() ?? path;
    for (const [pattern, value, kind] of rules) {
      const matches = pattern.startsWith("*")
        ? name.endsWith(pattern.slice(1))
        : name === pattern;
      if (!matches) continue;
      const target = result[kind === "language" ? "languages" : kind === "framework" ? "frameworks" : "packageManagers"];
      if (!target.includes(value)) target.push(value);
    }
  }

  return result;
}
