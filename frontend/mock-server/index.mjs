import { createApp } from "./server.mjs";

const app = createApp();
const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`mock-server listening on http://localhost:${port}`);
});
