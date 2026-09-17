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

export function listTodos(): ListTodosResult {
  return {
    isError: true,
    status: "not_implemented",
    todos: [],
    errors: [
      {
        where: "list_todos",
        message: "scaffold stub: list_todos is not implemented yet",
      },
    ],
  };
}
