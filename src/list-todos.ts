export type ListTodosStatus = "ok" | "auth_expired" | "not_implemented";

export type ListTodosError = {
  where: string;
  message: string;
};

export type TodoItem = {
  id: string;
  title: string;
  course_title: string;
  due_at: string | null;
};

export type ListTodosResult = {
  isError: boolean;
  status: ListTodosStatus;
  todos: TodoItem[];
  errors: ListTodosError[];
};

export type CredentialStore = {
  getCookie(): Promise<string | null>;
};

export type Icourse163HttpRequest = {
  url: string;
  cookie: string;
  method?: "GET" | "POST";
  form?: Record<string, string>;
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

/** Ports for a future real list_todos fetch (#3). The stub ignores them. */
export type ListTodosPorts = {
  credentials: CredentialStore;
  http: Icourse163Http;
};

export async function listTodos(_ports?: ListTodosPorts): Promise<ListTodosResult> {
  return {
    isError: true,
    status: "not_implemented",
    todos: [],
    errors: [
      {
        where: "list_todos",
        message:
          "scaffold stub: list_todos is not implemented yet (login/session is CLI-only; MCP never takes passwords)",
      },
    ],
  };
}
