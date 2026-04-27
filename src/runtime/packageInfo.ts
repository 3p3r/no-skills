import packageJson from '../../package.json';

type PackageJson = {
  name: string;
  version: string;
  postgrestLite: {
    defaultPostgrestVersion: string;
  };
};

const typedPackageJson = packageJson as PackageJson;

export const CLI_NAME = typedPackageJson.name;
export const CLI_VERSION = typedPackageJson.version;
export const DEFAULT_POSTGREST_VERSION = typedPackageJson.postgrestLite.defaultPostgrestVersion;