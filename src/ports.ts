export type CredentialStore = {
  getCookie(): Promise<string | null>;
};

export type Icourse163HttpRequest = {
  url: string;
  cookie: string;
  method?: "GET" | "POST";
  /** application/x-www-form-urlencoded body (mutually exclusive with json). */
  form?: Record<string, string>;
  /** application/json body (mutually exclusive with form). */
  json?: unknown;
  headers?: Record<string, string>;
};

export type Icourse163HttpResponse = {
  statusCode: number;
  url: string;
  body: string;
  cookie: string;
};

export type Icourse163Http = {
  request(input: Icourse163HttpRequest): Promise<Icourse163HttpResponse>;
};

export type Icourse163Ports = {
  credentials: CredentialStore;
  http: Icourse163Http;
};
