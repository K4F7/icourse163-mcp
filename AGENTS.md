# AGENTS.md

This is a Node/TypeScript **stdio MCP** for 中国大学MOOC ([icourse163.org](https://www.icourse163.org)). Issues live in [K4F7/icourse163-mcp](https://github.com/K4F7/icourse163-mcp).

- Start: `npm start` (`node --import tsx src/stdio.ts`). Do not put secrets, cookies, or passwords in tools, tests, or docs.
- Login is CLI-only (`npm run login`). MCP tools never accept passwords or cookies.
- `list_todos` fetches open 待办 via course-panel + mocTermDto RPCs. `status: ok` with empty todos means truly none open; `auth_expired` and other failures are `isError`.
- `list_courses` lists enrolled MOOC/SPOC courses (`id`, `name`, `school`, `type`, `term_id`).
- `list_term_units` returns lesson → unit catalog (`type`: video|doc|quiz|other, optional `learn_status`) for a course/term. Quiz/homework answering is out of scope here.
