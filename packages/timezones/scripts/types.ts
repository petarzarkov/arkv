export interface IANATzDataParams {
  url?: string;
  filesToExtract?: string[];
  fileEncoding?: BufferEncoding;
}

export interface IANATzDataFiles {
  version: string;
  lastModified: string;
  [key: string]: string;
}

export interface ZoneFileRow {
  countryCodes: string;
  coordinates: string;
  tzCode: string;
  comments: string;
}
