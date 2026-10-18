import { app, prisma } from "./app.js";
const port = Number(process.env.API_PORT || 4000);
const server = app.listen(port,()=>console.log(`Newtonite API listening on http://localhost:${port}`));
const shutdown = async () => { server.close(); await prisma.$disconnect(); };
process.on("SIGINT",shutdown);
process.on("SIGTERM",shutdown);
