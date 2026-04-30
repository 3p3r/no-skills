import packageJson from "../../package.json";

type PackageJson = {
  name: string;
  version: string;
};

const typedPackageJson = packageJson as PackageJson;

export const CLI_NAME = typedPackageJson.name;
export const CLI_VERSION = typedPackageJson.version;
