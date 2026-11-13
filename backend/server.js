import createApp from "./api/createApp.js";

const app = createApp();

// Downloads from an earlier run (for example after a crash) are not needed any more.
await app.locals.cloner.removeAll();

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`Server is up and running on port ${port}`);
});

// Hosts stop a server with SIGTERM (for example when a new version is deployed).
// Delete the downloaded repositories and stop politely.
process.on("SIGTERM", async () => {
  await app.locals.cloner.removeAll();
  server.close(() => process.exit(0));
});
