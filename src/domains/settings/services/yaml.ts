interface YamlDumpOptions {
  lineWidth?: number;
  noRefs?: boolean;
}

type YamlModule = typeof import('js-yaml');

let yamlModulePromise: Promise<YamlModule> | null = null;

async function getYamlModule(): Promise<YamlModule> {
  yamlModulePromise ??= import('js-yaml');
  return yamlModulePromise;
}

export async function loadYaml<T = unknown>(input: string): Promise<T> {
  const yaml = await getYamlModule();
  return yaml.load(input) as T;
}

export async function dumpYaml(
  value: unknown,
  options?: YamlDumpOptions,
): Promise<string> {
  const yaml = await getYamlModule();
  return yaml.dump(value, options);
}
